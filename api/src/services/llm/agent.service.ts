/**
 * LLM Agent Service
 *
 * LLM 기반 Agentic 노트 시스템의 핵심 로직
 * - Tool call 기반 recursive 동작
 * - History 유지 (매 iteration마다)
 * - 토큰 관리 (80% 임계치)
 */

import { prisma, io, redis } from '../../index.js';
import { executeTool, getToolDefinitions, ToolResult } from './tools.service.js';
import { updateTokenUsage, getTokenWarning, TokenUsageStatus, createAgentSession } from './token.service.js';
import { emitRequestProgress } from '../../websocket/server.js';
import { sendFailureEmail } from '../mail.service.js';

// LLM Proxy 설정
const LLM_PROXY_URL = process.env.LLM_PROXY_URL || 'http://localhost:3400/api/v1';
const LLM_SERVICE_ID = process.env.LLM_SERVICE_ID || 'aipo-web';
const MODEL_CONFIG_KEY = 'aipo:model_config';

interface ModelConfig {
  defaultModel: string;
  fallbackModels: string[];
}

/**
 * Dashboard /v1/models API에서 첫 번째 사용 가능한 모델 조회
 */
async function fetchFirstAvailableModel(): Promise<string | null> {
  try {
    const baseUrl = LLM_PROXY_URL
      .replace(/\/chat\/completions$/, '')
      .replace(/\/v1$/, '');
    const modelsUrl = `${baseUrl}/v1/models`;
    const response = await fetch(modelsUrl, {
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Id': LLM_SERVICE_ID,
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
 */
async function getModelConfig(): Promise<ModelConfig> {
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
  const firstModel = await fetchFirstAvailableModel();
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
function getSystemPrompt(type: 'INPUT' | 'SEARCH' | 'REFACTOR', treeStructure: string): string {
  const basePrompt = `당신은 AIPO for Web의 AI 어시스턴트입니다.
사용자의 입력을 분석하여 노트를 자동으로 정리하고 저장합니다.

## 현재 폴더/파일 구조
${treeStructure || '(빈 공간)'}

## 사용 가능한 도구
`;

  if (type === 'INPUT') {
    return basePrompt + `
### 폴더 관련
- add_folder(path): 새 폴더 생성 (예: /projects/aipo)
- undo_add_folder(path): 폴더 생성 취소
- edit_folder_name(path, newName): 폴더 이름 변경

### 파일 관련
- add_file(path, content): 새 파일 생성 (content는 BlockNote JSON 형식)
- undo_add_file(path): 파일 생성 취소
- read_file(path): 파일 내용 읽기
- edit_file(path, before, after): 파일 내용 수정 (before가 현재 내용과 일치해야 함)
- edit_file_name(path, newName): 파일 이름 변경
- move_file(fromPath, toPath): 파일 이동

### 완료
- complete(summary): 작업 완료 선언

## 규칙
1. 사용자 입력을 분석하여 적절한 폴더 구조와 파일로 정리하세요.
2. 기존 파일에 추가할지, 새 파일을 만들지 판단하세요.
3. 중복된 내용이 있는지 확인하세요.
4. 작업이 완료되면 반드시 complete()를 호출하세요.
5. 한국어로 노트를 작성하세요.

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
### 검색 도구
- read_file(path): 파일 내용 읽기
- complete(summary, searchResults): 검색 완료

## 규칙
1. 사용자의 검색 쿼리를 분석하세요.
2. 트리 구조를 보고 관련 있어 보이는 파일을 read_file로 확인하세요.
3. 관련성이 높은 순서대로 결과를 정리하세요.
4. searchResults 배열에 결과를 담아 complete()를 호출하세요.

## searchResults 형식
[
  { "fileId": "...", "path": "...", "title": "...", "snippet": "관련 내용...", "relevanceScore": 95 }
]
`;
  }

  // REFACTOR
  return basePrompt + `
### 리팩토링 도구
- add_folder(path): 새 폴더 생성
- add_file(path, content): 새 파일 생성
- read_file(path): 파일 내용 읽기
- edit_file(path, before, after): 파일 내용 수정
- move_file(fromPath, toPath): 파일 이동
- delete_file(path): 파일 삭제 (휴지통으로)
- delete_folder(path): 빈 폴더 삭제
- complete(summary): 작업 완료

## 규칙
1. 현재 구조를 분석하고 최적의 구조를 설계하세요.
2. 내용이 유실되지 않도록 주의하세요.
3. 비슷한 주제의 노트를 같은 폴더에 모으세요.
4. 작업 완료 후 변경 내용을 summary에 요약하세요.
`;
}

/**
 * LLM API 호출 (단일 모델)
 */
async function callLLMWithModel(
  messages: LLMMessage[],
  user: { loginid: string; username: string; deptname: string },
  model: string
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
      tools: getToolDefinitions(),
      tool_choice: 'auto',
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
  user: { loginid: string; username: string; deptname: string }
): Promise<LLMResponse> {
  const config = await getModelConfig();
  const modelsToTry = [config.defaultModel, ...config.fallbackModels];

  let lastError: Error | null = null;

  for (const model of modelsToTry) {
    try {
      console.log(`[Agent] Trying model: ${model}`);
      const response = await callLLMWithModel(messages, user, model);
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

  // 세션 초기화 (Redis에서 설정된 모델 사용)
  const modelConfig = await getModelConfig();
  const session = createAgentSession(modelConfig.defaultModel);

  // 초기 메시지
  const messages: LLMMessage[] = [
    { role: 'system', content: getSystemPrompt(type, treeStructure) },
    { role: 'user', content: userInput },
  ];

  // 결과 추적
  const result: AgentResult = {
    filesCreated: [],
    filesModified: [],
    foldersCreated: [],
  };

  let iteration = 0;

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
      const response = await callLLM(messages, request.user);

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
      // content는 null이라도 반드시 포함해야 함 (litellm 422 방지)
      messages.push({
        role: 'assistant',
        content: assistantMessage.content || null,
        tool_calls: assistantMessage.tool_calls,
      });

      // Tool call 처리
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          let toolArgs: Record<string, any>;

          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            toolArgs = {};
          }

          console.log(`[Agent] Tool call: ${toolName}`, toolArgs);

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

          // 결과 추적
          if (toolResult.success) {
            if (toolName === 'add_file') {
              result.filesCreated.push(toolArgs.path);
            } else if (toolName === 'edit_file') {
              result.filesModified.push(toolArgs.path);
            } else if (toolName === 'add_folder') {
              result.foldersCreated.push(toolArgs.path);
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
        }
      } else if (choice.finish_reason === 'stop') {
        // Tool call 없이 종료된 경우
        console.log(`[Agent] LLM finished without complete() call`);
        result.summary = assistantMessage.content || 'Task completed';
        return result;
      }

    } catch (error) {
      console.error(`[Agent] Iteration ${iteration} error:`, error);

      // 재시도 가능한 에러인지 확인
      if (iteration < 3) {
        // 처음 3번은 재시도
        await new Promise(resolve => setTimeout(resolve, 1000 * iteration));
        continue;
      }

      throw error;
    }
  }

  // 100회 초과
  console.log(`[Agent] Max iterations reached for request ${requestId}`);

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
  const folders = await prisma.folder.findMany({
    where: { spaceId },
    orderBy: { path: 'asc' },
    select: { path: true },
  });

  const files = await prisma.file.findMany({
    where: { spaceId, deletedAt: null },
    orderBy: { path: 'asc' },
    select: { path: true, name: true },
  });

  const lines: string[] = [];

  for (const folder of folders) {
    lines.push(`📁 ${folder.path}`);
  }

  for (const file of files) {
    lines.push(`  📄 ${file.path}`);
  }

  return lines.join('\n') || '(빈 공간 - 아직 노트가 없습니다)';
}
