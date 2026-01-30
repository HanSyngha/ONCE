/**
 * LLM Agent Service
 *
 * LLM 기반 Agentic 노트 시스템의 핵심 로직
 * - Tool call 기반 recursive 동작
 * - History 유지 (매 iteration마다)
 * - 토큰 관리 (80% 임계치)
 */

import { prisma, io, redis } from '../../index.js';
import { executeTool, getToolDefinitions, getSearchToolDefinitions, ToolResult } from './tools.service.js';
import { getTodoToolDefinitions, executeTodoTool } from './todo-tools.service.js';
import { updateTokenUsage, getTokenWarning, TokenUsageStatus, createAgentSession } from './token.service.js';
import { emitRequestProgress, emitAskUser, emitRequestFailed } from '../../websocket/server.js';
import { sendFailureEmail } from '../mail.service.js';

// ===================== ask_to_user 대기 메커니즘 =====================
interface UndoEntry {
  tool: string;
  params: Record<string, any>;
}

const pendingQuestions = new Map<string, {
  resolve: (answer: string) => void;
  reject: (error: Error) => void;
}>();

export function resolveUserAnswer(requestId: string, answer: string): boolean {
  const pending = pendingQuestions.get(requestId);
  if (pending) {
    pending.resolve(answer);
    pendingQuestions.delete(requestId);
    return true;
  }
  return false;
}

async function revertChanges(spaceId: string, undoStack: UndoEntry[]): Promise<void> {
  for (let i = undoStack.length - 1; i >= 0; i--) {
    try {
      await executeTool(spaceId, undoStack[i].tool, undoStack[i].params, 'system');
    } catch (err) {
      console.error(`[Agent] Revert failed for ${undoStack[i].tool}:`, err);
    }
  }
}

// LLM Proxy 설정
const LLM_PROXY_URL = process.env.LLM_PROXY_URL || 'http://localhost:3400/api/v1';
const LLM_SERVICE_ID = process.env.LLM_SERVICE_ID || 'once';
const MODEL_CONFIG_KEY = 'once:model_config';

interface ModelConfig {
  defaultModel: string;
  fallbackModels: string[];
}

/**
 * Dashboard /v1/models API에서 첫 번째 사용 가능한 모델 조회
 * 사업부 필터링을 위해 user 정보 필수
 */
async function fetchFirstAvailableModel(
  user: { loginid: string; username: string; deptname: string }
): Promise<string | null> {
  try {
    const baseUrl = LLM_PROXY_URL
      .replace(/\/chat\/completions$/, '')
      .replace(/\/v1$/, '');
    const modelsUrl = `${baseUrl}/v1/models`;

    const response = await fetch(modelsUrl, {
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Id': LLM_SERVICE_ID,
        'X-User-Id': user.loginid,
        'X-User-Name': encodeURIComponent(user.username),
        'X-User-Dept': encodeURIComponent(user.deptname),
      },
    });
    if (response.ok) {
      const data = await response.json() as any;
      const models = data.data || [];
      if (models.length > 0) {
        return models[0].id;
      }
    }
  } catch (e) {
    console.error('[Agent] Failed to fetch models from proxy:', e);
  }
  return null;
}

/**
 * Redis에서 모델 설정 조회. 없으면 Dashboard API에서 동적으로 가져옴
 * 사업부 필터링을 위해 user 정보 필수
 */
async function getModelConfig(
  user: { loginid: string; username: string; deptname: string }
): Promise<ModelConfig> {
  try {
    const configStr = await redis.get(MODEL_CONFIG_KEY);
    if (configStr) {
      const config = JSON.parse(configStr);
      if (config.defaultModel) {
        return {
          defaultModel: config.defaultModel,
          fallbackModels: config.fallbackModels || [],
        };
      }
    }
  } catch (e) {
    console.error('[Agent] Failed to read model config from Redis:', e);
  }

  // Redis에 설정이 없으면 Dashboard API에서 첫 번째 모델 사용
  const firstModel = await fetchFirstAvailableModel(user);
  if (firstModel) {
    return { defaultModel: firstModel, fallbackModels: [] };
  }

  // 최후 수단: 환경변수 (설정 안 되어있으면 에러 발생하게 빈 문자열)
  const envModel = process.env.LLM_DEFAULT_MODEL || '';
  if (!envModel) {
    console.error('[Agent] No model available: Redis empty, API unreachable, LLM_DEFAULT_MODEL not set');
  }
  return { defaultModel: envModel, fallbackModels: [] };
}

// 제한 설정
const MAX_ITERATIONS = 100;

interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface LLMResponse {
  choices: Array<{
    message: {
      role: string;
      content?: string;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface AgentResult {
  filesCreated: string[];
  filesModified: string[];
  foldersCreated: string[];
  summary?: string;
  searchResults?: Array<{
    fileId: string;
    path: string;
    title: string;
    snippet: string;
    relevanceScore: number;
  }>;
}

/**
 * 시스템 프롬프트 생성
 */
function getSystemPrompt(type: 'INPUT' | 'SEARCH' | 'REFACTOR', treeStructure: string, isPersonalSpace: boolean = false): string {
  const basePrompt = `당신은 ONCE의 AI 어시스턴트입니다.
사용자의 입력을 분석하여 노트를 자동으로 정리하고 저장합니다.

## 루트 폴더 구조 (최상위만 표시)
${treeStructure || '(빈 공간)'}

위는 루트 경로("/")의 직계 자식만 보여줍니다.
하위 내용을 보려면 반드시 list_folder(path)를 사용하세요.

## 폴더 계층 구조 원칙

이 시스템은 **대분류 → 소분류 → ... → 파일** 의 계층 트리로 노트를 관리합니다.
폴더는 카테고리(분류) 역할, 파일은 실제 콘텐츠입니다.

예시:
  /프로젝트/ONCE/회의록/2024-01-15-킥오프.md
  /학습/머신러닝/강화학습/DQN-정리.md
  /업무일지/2024/1월/15일.md

### 왜 이 구조인가?
사용자 수와 노트가 늘어나도 **폴더명 기반으로 단계적으로 drill-down**하여 빠르게 검색할 수 있습니다.
따라서 폴더명과 파일명은 **내용을 잘 설명하는 명확한 이름**이어야 합니다.

### 구조 유지 규칙 (모든 작업에 적용)
1. 파일을 추가할 때 기존 폴더 구조를 먼저 탐색하여 **가장 적합한 위치**에 배치하세요.
2. 기존 폴더/파일명이 모호하거나 새 내용과 맞지 않으면, **내용 손실 없이** 폴더명/파일명/위치를 조정하세요.
3. 같은 주제의 노트가 흩어져 있으면 같은 폴더로 모으세요.
4. 폴더명은 짧고 명확한 카테고리명 (예: "회의록", "설계문서", "학습노트")
5. 파일명은 제목 역할 — 검색 시 폴더명+파일명만 보고도 내용을 짐작할 수 있어야 합니다.
6. 적절한 깊이로 분류하되, 불필요하게 깊지 않도록 하세요 (보통 2~4단계가 적절).
${isPersonalSpace ? '\n### 개인 공간 폴더 깊이 제한\n이 공간은 **개인 공간**입니다. 폴더 깊이는 **최대 4단계**까지만 허용됩니다 (5단계 이상 불가).\n예: /대분류/중분류/소분류/세부분류 (4단계 — 허용)\n예: /대분류/중분류/소분류/세부분류/항목 (5단계 — 불가)\n폴더 구조를 설계할 때 이 제한을 반드시 고려하세요.\n' : ''}`;


  if (type === 'INPUT') {
    return basePrompt + `
## 사용 가능한 도구

### 탐색
- list_folder(path): 해당 폴더의 직계 자식(폴더+파일)만 조회. "/" = 루트.

### 폴더 관련
- add_folder(path): 새 폴더 생성 (예: /프로젝트/ONCE)
- undo_add_folder(path): 폴더 생성 취소
- edit_folder_name(path, newName): 폴더 이름 변경

### 파일 관련
- add_file(path, content): 새 파일 생성 (content는 BlockNote JSON 형식)
- undo_add_file(path): 파일 생성 취소
- read_file(path): 파일 내용 읽기
- edit_file(path, before, after): 파일 내용 수정 (before가 현재 내용과 일치해야 함)
- edit_file_name(path, newName): 파일 이름 변경
- move_file(fromPath, toPath): 파일 이동

### 사용자 질문
- ask_to_user(question, options): 사용자에게 질문합니다. 2~5개 객관식 선택지를 제공하세요.
  - 입력 내용이 모호하여 정확한 분류/처리가 어려울 때 사용
  - 선택지는 구체적이고 명확해야 합니다
  - 사용자가 "직접 입력"으로 다른 답변을 할 수도 있습니다
  - 질문은 최소한으로 하세요 (꼭 필요할 때만)

### 완료
- complete(summary): 작업 완료 선언

## 필수 규칙 (절대 위반 금지)
- **매 응답에서 반드시 도구를 호출하세요.** 텍스트만 응답하면 안 됩니다. 항상 도구(tool) 중 하나를 호출해야 합니다. 할 일이 끝났으면 complete()를 호출하세요.
- **한 번에 하나의 도구만 호출하세요.** 여러 도구를 동시에 호출하지 마세요.
- **기존 파일 수정(edit_file)을 새 파일 생성(add_file)보다 항상 우선하세요.** 같은 주제/카테고리의 파일이 이미 있으면 반드시 edit_file로 내용을 추가하세요. 중복 파일 생성은 금지합니다.
- 폴더만 만들고 끝내면 안 됩니다. 반드시 최소 1개 이상의 파일을 add_file로 생성하거나 edit_file로 수정해야 합니다.
- add_file의 content는 반드시 사용자 입력 내용이 반영된 실질적인 내용이어야 합니다. 빈 배열 []이나 제목만 있는 파일은 금지합니다.
- complete() 호출 전 반드시 파일 생성/수정이 1회 이상 이루어졌는지 확인하세요. 하지 않았다면 반드시 파일을 먼저 생성/수정하세요.

## 작업 절차 (반드시 따르세요 — update 우선 원칙)
1. 사용자 입력을 분석하여 주제/카테고리를 파악하세요.
2. **반드시 list_folder("/")로 루트를 먼저 확인하세요.** 폴더 구조를 확인하지 않고 바로 파일을 생성하면 안 됩니다.
3. 관련 있어 보이는 폴더가 있으면 list_folder로 한 단계씩 들어가며 **기존 파일이 있는지 철저히 탐색**하세요.
4. **기존 파일 확인 (가장 중요)**: 같은 주제/카테고리의 파일이 존재하면 read_file로 내용을 읽고, edit_file로 새 내용을 추가/보완하세요. 이것이 최우선입니다.
5. **기존 파일이 없을 때만** 새 폴더/파일을 생성하세요. 적절한 폴더가 없으면 새 폴더 구조를 만든 후 add_file로 파일을 생성하세요.
6. **구조 정리**: 파일을 추가/수정한 후, 주변 폴더/파일명이 새 내용과 어울리지 않으면 edit_folder_name, edit_file_name, move_file로 조정하세요. 단, 기존 내용은 절대 유실하지 마세요.
7. **완료 전 점검**: add_file 또는 edit_file을 최소 1회 이상 호출했는지 확인하세요. 하지 않았다면 반드시 파일을 생성/수정한 후 complete()를 호출하세요.
8. 한국어로 노트를 작성하세요.

## 콘텐츠 형식
파일 content는 BlockNote JSON 형식이어야 합니다:
[
  { "type": "heading", "props": { "level": 1 }, "content": [{ "type": "text", "text": "제목" }] },
  { "type": "paragraph", "content": [{ "type": "text", "text": "내용..." }] }
]
`;
  }

  if (type === 'SEARCH') {
    return basePrompt + `
## 사용 가능한 도구
- list_folder(path): 해당 폴더의 직계 자식(폴더+파일)만 조회. "/" = 루트.
- read_file(path): 파일 내용 읽기
- complete(summary, searchResults): 검색 완료

## 검색 절차 (Recursive Drill-Down — 반드시 따르세요)
대규모 트리에서 효율적으로 검색하려면 다음 패턴을 사용하세요:

1. **루트 탐색**: list_folder("/")로 최상위 폴더 목록 확인
2. **관련 폴더 선택**: 검색 쿼리와 관련 있어 보이는 폴더명을 골라 list_folder로 한 단계 deeper
3. **반복 drill-down**: 하위 폴더 중 관련 있는 것을 계속 list_folder로 탐색
4. **파일 발견**: 제목이 관련 있어 보이는 파일을 read_file로 내용 확인
5. **결과 수집**: 관련성 높은 파일들을 searchResults에 담아 complete() 호출

주의:
- 전체 트리를 한번에 볼 수 없습니다. 반드시 list_folder로 한 단계씩 탐색하세요.
- 폴더명으로 1차 필터링 → 파일명으로 2차 필터링 → 내용으로 3차 확인
- 관련 없는 폴더는 건너뛰어 토큰을 절약하세요.
- 최소 2-3개 관련 폴더를 탐색하세요.

## searchResults 형식
[
  { "fileId": "...", "path": "...", "title": "...", "snippet": "관련 내용 발췌...", "relevanceScore": 95 }
]
`;
  }

  // REFACTOR
  return basePrompt + `
## 사용 가능한 도구
- list_folder(path): 해당 폴더의 직계 자식(폴더+파일)만 조회
- add_folder(path): 새 폴더 생성
- add_file(path, content): 새 파일 생성
- read_file(path): 파일 내용 읽기
- edit_file(path, before, after): 파일 내용 수정
- move_file(fromPath, toPath): 파일 이동
- delete_file(path): 파일 삭제 (휴지통으로)
- delete_folder(path): 빈 폴더 삭제
- ask_to_user(question, options): 사용자에게 질문합니다. 2~5개 객관식 선택지를 제공하세요.
  - 리팩토링 방향이 불확실하거나 사용자 확인이 필요할 때 사용
  - 질문은 최소한으로 하세요 (꼭 필요할 때만)
- complete(summary): 작업 완료

## 리팩토링 절차
1. list_folder("/")로 루트 구조를 확인하세요.
2. 각 폴더를 list_folder로 탐색하여 현재 구조를 파악하세요.
3. 최적의 계층 구조를 설계하세요 (대분류 → 소분류 → 파일).
4. move_file, add_folder 등으로 구조를 개선하세요.
5. 내용이 유실되지 않도록 주의하세요.
6. 비슷한 주제의 노트를 같은 폴더에 모으세요.
7. 작업 완료 후 변경 내용을 summary에 요약하세요.
`;
}

/**
 * LLM API 호출 (단일 모델)
 */
async function callLLMWithModel(
  messages: LLMMessage[],
  user: { loginid: string; username: string; deptname: string },
  model: string,
  tools: any[]
): Promise<LLMResponse> {
  const response = await fetch(LLM_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': user.loginid,
      'X-User-Name': encodeURIComponent(user.username),
      'X-User-Dept': encodeURIComponent(user.deptname),
      'X-Service-Id': LLM_SERVICE_ID,
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: 'required',
      parallel_tool_calls: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM API error (model: ${model}): ${response.status} - ${error}`);
  }

  return response.json() as Promise<LLMResponse>;
}

/**
 * LLM API 호출 (default → fallback 순서로 시도)
 */
async function callLLM(
  messages: LLMMessage[],
  user: { loginid: string; username: string; deptname: string },
  tools: any[]
): Promise<LLMResponse> {
  const config = await getModelConfig(user);
  const modelsToTry = [config.defaultModel, ...config.fallbackModels];

  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      console.log(`[Agent] Trying model: ${model}`);
      const response = await callLLMWithModel(messages, user, model, tools);
      return response;
    } catch (error) {
      lastError = error as Error;
      console.warn(`[Agent] Model ${model} failed:`, (error as Error).message);
      // 다음 fallback 모델 시도
    }
  }

  throw lastError || new Error('All models failed');
}

/**
 * Agent Loop 실행
 */
export async function runAgentLoop(
  requestId: string,
  spaceId: string,
  type: 'INPUT' | 'SEARCH' | 'REFACTOR',
  userInput: string
): Promise<AgentResult> {
  // 요청 및 사용자 정보 조회
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: {
      user: { select: { loginid: true, username: true, deptname: true } },
    },
  });

  if (!request) throw new Error('Request not found');

  // 공간 트리 구조 조회
  const treeStructure = await getTreeStructure(spaceId);

  // 개인 공간 여부 확인
  const space = await prisma.space.findUnique({ where: { id: spaceId } });
  const isPersonalSpace = space?.userId != null;

  // 세션 초기화 (Redis에서 설정된 모델 사용, 사업부 필터링 반영)
  const modelConfig = await getModelConfig(request.user);
  const session = createAgentSession(modelConfig.defaultModel);

  // 초기 메시지
  const messages: LLMMessage[] = [
    { role: 'system', content: getSystemPrompt(type, treeStructure, isPersonalSpace) },
    { role: 'user', content: userInput },
  ];

  // 결과 추적
  const result: AgentResult = {
    filesCreated: [],
    filesModified: [],
    foldersCreated: [],
  };

  // Undo 스택 (ask_to_user 타임아웃 시 revert 용)
  const undoStack: UndoEntry[] = [];

  // Agent 타입별 도구 세트 선택
  const tools = type === 'SEARCH' ? getSearchToolDefinitions() : getToolDefinitions();

  let iteration = 0;
  let retryCount = 0;

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    console.log(`[Agent] Iteration ${iteration} for request ${requestId}`);

    // 진행 상태 WebSocket 전송
    emitRequestProgress(io, requestId, {
      iteration,
      progress: Math.min(iteration / MAX_ITERATIONS * 100, 99),
      message: `처리 중... (${iteration}회)`,
    });

    try {
      // LLM 호출
      const response = await callLLM(messages, request.user, tools);

      // 토큰 사용량 업데이트
      const tokenStatus = updateTokenUsage(session, response.usage);

      console.log(`[Agent] Token usage: ${tokenStatus.usagePercent}% (${tokenStatus.currentPromptTokens} prompt + ${tokenStatus.completionTokens} completion)`);

      // 요청 업데이트
      await prisma.request.update({
        where: { id: requestId },
        data: {
          iterations: iteration,
          tokensUsed: response.usage.total_tokens,
        },
      });

      // 80% 토큰 도달 시 경고 추가
      if (tokenStatus.needsFinish && !messages[0].content?.includes('TOKEN LIMIT WARNING')) {
        messages[0].content += '\n\n' + getTokenWarning(tokenStatus);
      }

      // 100% 토큰 초과 시 강제 종료
      if (tokenStatus.isExceeded) {
        console.log(`[Agent] Token limit exceeded for request ${requestId}`);

        await sendFailureEmail(
          request.user.loginid,
          request.user.username,
          '토큰 한도 초과',
          `요청 처리 중 토큰 한도를 초과했습니다. 입력을 줄여서 다시 시도해주세요.`
        );

        throw new Error('Token limit exceeded');
      }

      const choice = response.choices[0];

      if (!choice) {
        throw new Error('No response from LLM');
      }

      const assistantMessage = choice.message;

      // Assistant 메시지 히스토리에 추가
      // content는 빈 문자열이라도 반드시 포함해야 함 (vLLM/litellm 422 방지)
      messages.push({
        role: 'assistant',
        content: assistantMessage.content ?? '',
        tool_calls: assistantMessage.tool_calls,
      });

      // Tool call 처리 — 한 번에 하나만 (parallel_tool_calls: false 방어)
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        if (assistantMessage.tool_calls.length > 1) {
          console.warn(`[Agent] LLM returned ${assistantMessage.tool_calls.length} tool calls, processing only first one`);
          // assistant 메시지의 tool_calls도 첫 번째만 유지 (히스토리 정합성)
          assistantMessage.tool_calls = [assistantMessage.tool_calls[0]];
          messages[messages.length - 1].tool_calls = assistantMessage.tool_calls;
        }

        const toolCall = assistantMessage.tool_calls[0];
        const toolName = toolCall.function.name;
        let toolArgs: Record<string, any>;

        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch (parseErr) {
          console.error(`[Agent] Failed to parse tool arguments for ${toolName}:`, toolCall.function.arguments?.substring(0, 200));
          // JSON 파싱 실패 → 에러 응답으로 LLM에게 재시도 유도
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolName,
            content: JSON.stringify({ success: false, message: 'Invalid JSON arguments. Please retry with valid JSON.', error: 'INVALID_JSON' }),
          });
          continue; // 다음 iteration으로
        }

        console.log(`[Agent] Tool call: ${toolName}`, toolArgs);

        // ask_to_user 처리: WebSocket으로 질문 전송 후 응답 대기
        if (toolName === 'ask_to_user') {
          emitAskUser(io, requestId, {
            question: toolArgs.question,
            options: toolArgs.options,
            timeoutMs: 180_000,
          });

          let userAnswer: string;
          try {
            userAnswer = await new Promise<string>((resolve, reject) => {
              pendingQuestions.set(requestId, { resolve, reject });
              setTimeout(() => {
                if (pendingQuestions.has(requestId)) {
                  pendingQuestions.delete(requestId);
                  reject(new Error('ASK_USER_TIMEOUT'));
                }
              }, 180_000);
            });
          } catch (err) {
            if ((err as Error).message === 'ASK_USER_TIMEOUT') {
              console.log(`[Agent] ask_to_user timeout for request ${requestId}, reverting ${undoStack.length} changes`);
              await revertChanges(spaceId, undoStack);
              await prisma.request.update({
                where: { id: requestId },
                data: { status: 'CANCELLED', error: 'User response timeout' },
              });
              await sendFailureEmail(
                request.user.loginid,
                request.user.username,
                '응답 시간 초과',
                'AI가 질문을 보냈으나 3분 내에 응답이 없어 작업이 취소되었습니다. 진행 중이던 모든 변경이 원복되었습니다.'
              );
              emitRequestFailed(io, requestId, request.user.loginid, '응답 시간 초과로 작업이 취소되었습니다.');
              throw new Error('User response timeout - all changes reverted');
            }
            throw err;
          }

          // 응답을 tool result로 LLM에 전달
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: 'ask_to_user',
            content: JSON.stringify({ success: true, message: `사용자 응답: ${userAnswer}` }),
          });

          await prisma.requestLog.create({
            data: {
              requestId,
              iteration,
              tool: toolName,
              params: JSON.stringify(toolArgs),
              result: JSON.stringify({ answer: userAnswer }),
              success: true,
              duration: 0,
            },
          });

          continue; // 다음 iteration으로
        }

        // complete() 호출 시 종료
        if (toolName === 'complete') {
          result.summary = toolArgs.summary;
          if (toolArgs.searchResults) {
            result.searchResults = toolArgs.searchResults;
          }

          // 로그 기록
          await prisma.requestLog.create({
            data: {
              requestId,
              iteration,
              tool: toolName,
              params: JSON.stringify(toolArgs),
              result: 'completed',
              success: true,
            },
          });

          return result;
        }

        // 도구 실행
        const startTime = Date.now();
        const toolResult = await executeTool(spaceId, toolName, toolArgs, request.user.loginid);
        const duration = Date.now() - startTime;

        // 결과 추적 + Undo 스택
        if (toolResult.success) {
          if (toolName === 'add_file') {
            result.filesCreated.push(toolArgs.path);
            undoStack.push({ tool: 'undo_add_file', params: { path: toolArgs.path } });
          } else if (toolName === 'edit_file') {
            result.filesModified.push(toolArgs.path);
            undoStack.push({ tool: 'edit_file', params: { path: toolArgs.path, before: toolArgs.after, after: toolArgs.before } });
          } else if (toolName === 'add_folder') {
            result.foldersCreated.push(toolArgs.path);
            undoStack.push({ tool: 'undo_add_folder', params: { path: toolArgs.path } });
          } else if (toolName === 'move_file') {
            undoStack.push({ tool: 'move_file', params: { fromPath: toolArgs.toPath, toPath: toolArgs.fromPath } });
          } else if (toolName === 'edit_file_name') {
            const oldName = toolArgs.path.split('/').pop() || '';
            const parentPath = toolArgs.path.substring(0, toolArgs.path.lastIndexOf('/'));
            const newPath = parentPath + '/' + toolArgs.newName;
            undoStack.push({ tool: 'edit_file_name', params: { path: newPath, newName: oldName } });
          } else if (toolName === 'edit_folder_name') {
            const oldName = toolArgs.path.split('/').pop() || '';
            const parentPath = toolArgs.path.substring(0, toolArgs.path.lastIndexOf('/'));
            const newPath = parentPath + '/' + toolArgs.newName;
            undoStack.push({ tool: 'edit_folder_name', params: { path: newPath, newName: oldName } });
          } else if (toolName === 'delete_file' && toolResult.data?.fileId) {
            undoStack.push({ tool: 'restore_file', params: { fileId: toolResult.data.fileId } });
          }
        }

        // 로그 기록
        await prisma.requestLog.create({
          data: {
            requestId,
            iteration,
            tool: toolName,
            params: JSON.stringify(toolArgs),
            result: JSON.stringify(toolResult),
            success: toolResult.success,
            duration,
          },
        });

        // Tool 응답 히스토리에 추가
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: toolName,
          content: JSON.stringify(toolResult),
        });

        // 성공 시 retry 카운트 리셋
        retryCount = 0;
      } else {
        // tool_choice=required인데 tool call 없이 응답 → 재촉 메시지로 재시도
        console.warn(`[Agent] LLM returned no tool call (tool_choice=required), nudging to use tools`);

        // assistant가 텍스트만 보낸 경우, 재촉 user 메시지를 추가하여 다음 iteration에서 도구 호출 유도
        messages.push({
          role: 'user',
          content: '도구를 반드시 호출하세요. 텍스트로만 응답하면 안 됩니다. 할 일이 남아있으면 적절한 도구를 호출하고, 모든 작업이 끝났으면 complete()를 호출하세요.',
        });

        retryCount++;
        console.warn(`[Agent] No tool call retry ${retryCount}/3`);
        if (retryCount >= 3) {
          // 이미 작업한 결과가 있으면 partial result 반환
          const hasWork = result.filesCreated.length > 0 || result.filesModified.length > 0 || result.foldersCreated.length > 0;
          if (hasWork) {
            console.log(`[Agent] No tool call max retries but returning partial result`);
            result.summary = result.summary || '작업 결과가 저장되었습니다.';
            return result;
          }
          throw new Error('LLM returned no tool call with tool_choice=required');
        }
        continue;
      }

    } catch (error) {
      retryCount++;
      console.error(`[Agent] Iteration ${iteration} error (retry ${retryCount}/3):`, error);

      if (retryCount >= 3) {
        console.error(`[Agent] Max retries reached for request ${requestId}, stopping`);

        // 이미 작업한 결과가 있으면 partial result 반환 (실패로 처리하지 않음)
        const hasWork = result.filesCreated.length > 0 || result.filesModified.length > 0 || result.foldersCreated.length > 0;
        if (hasWork) {
          console.log(`[Agent] Returning partial result: ${result.filesCreated.length} files created, ${result.filesModified.length} modified`);
          result.summary = result.summary || '처리 중 일부 오류가 발생했지만, 작업 결과는 저장되었습니다.';
          return result;
        }

        throw error;
      }

      // 에러 후 재시도 대기
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      continue;
    }
  }

  // 100회 초과
  console.log(`[Agent] Max iterations reached for request ${requestId}`);

  // 이미 작업한 결과가 있으면 partial result 반환
  const hasWork = result.filesCreated.length > 0 || result.filesModified.length > 0 || result.foldersCreated.length > 0;
  if (hasWork) {
    console.log(`[Agent] Max iterations but returning partial result: ${result.filesCreated.length} files created, ${result.filesModified.length} modified`);
    result.summary = result.summary || '처리 횟수가 초과되었지만, 작업 결과는 저장되었습니다.';
    return result;
  }

  await sendFailureEmail(
    request.user.loginid,
    request.user.username,
    '처리 횟수 초과',
    `요청 처리가 ${MAX_ITERATIONS}회를 초과했습니다. 입력을 간결하게 하여 다시 시도해주세요.`
  );

  throw new Error(`Max iterations (${MAX_ITERATIONS}) reached`);
}

/**
 * 공간의 트리 구조 문자열 생성
 */
async function getTreeStructure(spaceId: string): Promise<string> {
  // 루트 직계 자식만 반환 (전체 트리를 덤프하지 않음 — 스케일링 대응)
  const rootFolders = await prisma.folder.findMany({
    where: { spaceId, parentId: null },
    orderBy: { name: 'asc' },
    select: { name: true, path: true },
  });

  const rootFiles = await prisma.file.findMany({
    where: { spaceId, folderId: null, deletedAt: null },
    orderBy: { name: 'asc' },
    select: { name: true, path: true },
  });

  const lines: string[] = [];

  for (const folder of rootFolders) {
    lines.push(`📁 ${folder.name}/`);
  }

  for (const file of rootFiles) {
    lines.push(`📄 ${file.name}`);
  }

  return lines.join('\n') || '(빈 공간 - 아직 노트가 없습니다)';
}

/**
 * Todo Agent Loop
 *
 * 매 INPUT 요청 시 병렬로 실행되는 Todo 전용 agent.
 * 사용자 입력에서 action item을 추출하여 Todo를 추가/완료/수정합니다.
 * - 최대 50 iterations
 * - tool_choice: required
 * - nothing_more_todo 호출 시 종료
 */
const TODO_MAX_ITERATIONS = 50;

export async function runTodoAgentLoop(
  requestId: string,
  userId: string,
  spaceId: string,
  userInput: string
): Promise<void> {
  // 사용자 정보 조회
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { loginid: true, username: true, deptname: true },
  });

  if (!user) {
    console.error(`[TodoAgent] User not found: ${userId}`);
    return;
  }

  // 현재 Todo 목록 조회 (미완료 + 최근 완료 포함, 최대 200개)
  const currentTodos = await prisma.todo.findMany({
    where: { userId, spaceId },
    orderBy: [
      { completed: 'asc' },
      { startDate: 'asc' },
    ],
    take: 200,
  });

  const todayStr = new Date().toISOString().split('T')[0];

  const todoListStr = currentTodos.length > 0
    ? currentTodos.map(t => {
        const status = t.completed ? '✅ 완료' : '⬜ 미완료';
        const start = t.startDate.toISOString().split('T')[0];
        const end = t.endDate.toISOString().split('T')[0];
        return `- [${status}] ${t.title} (${start} ~ ${end})${t.content ? ` — ${t.content}` : ''}`;
      }).join('\n')
    : '(등록된 Todo 없음)';

  const systemPrompt = `당신은 ONCE의 Todo 추출 에이전트입니다.
사용자의 입력을 분석하여 할일(action item)을 추출하고 Todo를 관리합니다.

## 오늘 날짜
${todayStr}

## 사용자 정보
- 이름: ${user.username}
- 부서: ${user.deptname}

## 현재 Todo 목록
${todoListStr}

## 사용 가능한 도구
- add_todo(title, content?, startDate?, endDate?): 새 Todo 추가. 기본값: startDate=오늘, endDate=1년 후
- complete_todo(title): 제목으로 기존 Todo를 완료 처리
- update_todo(title, startDate?, endDate?): 제목으로 기존 Todo의 기간 수정
- nothing_more_todo(): 더 이상 처리할 Todo가 없을 때 호출

## 규칙
1. 사용자 입력에서 할일, 해야 할 작업, 약속, 일정 등을 모두 추출하세요.
2. 이미 완료된 작업이 언급되면 complete_todo로 완료 처리하세요.
3. 기간 변경이 언급되면 update_todo로 수정하세요.
4. 중복 Todo를 만들지 마세요. 현재 Todo 목록을 확인하세요.
5. 한 번에 하나의 도구만 호출하세요.
6. 모든 Todo 추가/수정/완료 작업을 마친 후 반드시 nothing_more_todo를 호출하세요.
7. 입력에 할일이 전혀 없다면 즉시 nothing_more_todo를 호출하세요.
8. Todo 제목은 한국어로 간결하게 작성하세요.`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userInput },
  ];

  const todoTools = getTodoToolDefinitions();
  let iteration = 0;
  let retryCount = 0;

  while (iteration < TODO_MAX_ITERATIONS) {
    iteration++;

    console.log(`[TodoAgent] Iteration ${iteration} for request ${requestId}`);

    try {
      const response = await callLLM(messages, user, todoTools);

      const choice = response.choices[0];
      if (!choice) {
        throw new Error('No response from LLM');
      }

      const assistantMessage = choice.message;

      // 히스토리에 추가
      messages.push({
        role: 'assistant',
        content: assistantMessage.content ?? '',
        tool_calls: assistantMessage.tool_calls,
      });

      // tool call 필수
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        throw new Error('LLM returned no tool call with tool_choice=required');
      }

      // 첫 번째 tool call만 처리 (한 번에 하나)
      const toolCall = assistantMessage.tool_calls[0];
      const toolName = toolCall.function.name;
      let toolArgs: Record<string, any>;

      try {
        toolArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        toolArgs = {};
      }

      console.log(`[TodoAgent] Tool call: ${toolName}`, toolArgs);

      // nothing_more_todo → 종료
      if (toolName === 'nothing_more_todo') {
        console.log(`[TodoAgent] Completed for request ${requestId} after ${iteration} iterations`);
        return;
      }

      // 도구 실행
      const toolResult = await executeTodoTool(userId, spaceId, toolName, toolArgs);

      console.log(`[TodoAgent] Tool result: ${toolResult.message}`);

      // 도구 결과를 히스토리에 추가
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolName,
        content: JSON.stringify(toolResult),
      });

      // done 플래그 (방어적 체크)
      if (toolResult.done) {
        console.log(`[TodoAgent] Done flag received for request ${requestId}`);
        return;
      }

      // 성공 시 retry 카운터 리셋
      retryCount = 0;

    } catch (error) {
      retryCount++;
      console.error(`[TodoAgent] Iteration ${iteration} error (retry ${retryCount}/3):`, error);

      if (retryCount >= 3) {
        console.error(`[TodoAgent] Max retries reached for request ${requestId}, stopping`);
        return;
      }

      // 재시도 대기
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
    }
  }

  console.warn(`[TodoAgent] Max iterations (${TODO_MAX_ITERATIONS}) reached for request ${requestId}`);
}
