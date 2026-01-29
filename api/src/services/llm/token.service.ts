/**
 * Token Management Service
 *
 * LLM 토큰 사용량 추적 및 관리
 * OpenAI API 응답의 usage 필드 활용
 */

// 기본 최대 토큰 (모델 정보를 가져올 수 없을 때 사용)
const DEFAULT_MAX_TOKENS = 128000;

export interface AgentSession {
  modelName: string;
  maxTokens: number;
  lastPromptTokens: number;
  lastCompletionTokens: number;
  iterationCount: number;
}

export interface TokenUsageStatus {
  currentPromptTokens: number;
  completionTokens: number;
  estimatedNextPrompt: number;
  remainingTokens: number;
  usagePercent: number;
  needsFinish: boolean;
  isExceeded: boolean;
}

export interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * 모델의 최대 토큰 수 조회
 * maxTokensOverride가 있으면 우선 사용 (Dashboard API에서 가져온 값)
 */
export function getMaxTokens(_modelName: string, maxTokensOverride?: number): number {
  if (maxTokensOverride && maxTokensOverride > 0) {
    return maxTokensOverride;
  }
  return DEFAULT_MAX_TOKENS;
}

/**
 * Agent 세션 생성
 */
export function createAgentSession(modelName: string): AgentSession {
  return {
    modelName,
    maxTokens: getMaxTokens(modelName),
    lastPromptTokens: 0,
    lastCompletionTokens: 0,
    iterationCount: 0,
  };
}

/**
 * 토큰 사용량 업데이트
 *
 * OpenAI API 응답의 usage 정보를 활용하여 토큰 사용량 추적
 */
export function updateTokenUsage(
  session: AgentSession,
  usage: LLMUsage
): TokenUsageStatus {
  const { prompt_tokens, completion_tokens } = usage;

  // 현재 iteration의 전체 컨텍스트 = prompt_tokens (이전 history 포함)
  session.lastPromptTokens = prompt_tokens;
  session.lastCompletionTokens = completion_tokens;
  session.iterationCount++;

  // 다음 iteration에서의 예상 사용량
  // = 현재 prompt_tokens + 이번 completion + 다음 tool 응답 예상 (500 토큰 여유분)
  const estimatedNextPrompt = prompt_tokens + completion_tokens + 500;

  const usagePercent = Math.round((estimatedNextPrompt / session.maxTokens) * 100);
  const remainingTokens = session.maxTokens - estimatedNextPrompt;

  return {
    currentPromptTokens: prompt_tokens,
    completionTokens: completion_tokens,
    estimatedNextPrompt,
    remainingTokens,
    usagePercent,
    needsFinish: usagePercent >= 80,
    isExceeded: usagePercent >= 100,
  };
}

/**
 * 토큰 경고 메시지 생성 (System Prompt에 추가)
 */
export function getTokenWarning(status: TokenUsageStatus): string {
  const estimatedSentences = Math.floor(status.remainingTokens / 100);

  return `
⚠️ TOKEN LIMIT WARNING ⚠️
- 현재 토큰 사용률: ${status.usagePercent}%
- 남은 토큰: ${status.remainingTokens}개 (예상 ${estimatedSentences}문장)
- 상태: 마무리 필요

지침:
1. 현재 진행 중인 작업을 즉시 완료하세요.
2. 추가 파일 읽기나 복잡한 수정은 피하세요.
3. 다음 1-2 iteration 내에 반드시 complete()를 호출하세요.
4. 미완료 작업이 있다면 summary에 "추가 작업 필요: ..."로 명시하세요.
`;
}

/**
 * 토큰 사용량 통계 계산
 */
export function calculateTokenStats(sessions: AgentSession[]): {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  averageUsagePercent: number;
} {
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for (const session of sessions) {
    totalPromptTokens += session.lastPromptTokens;
    totalCompletionTokens += session.lastCompletionTokens;
  }

  const totalTokens = totalPromptTokens + totalCompletionTokens;

  // 평균 사용률 계산
  let totalUsagePercent = 0;
  for (const session of sessions) {
    const sessionTotal = session.lastPromptTokens + session.lastCompletionTokens;
    totalUsagePercent += (sessionTotal / session.maxTokens) * 100;
  }
  const averageUsagePercent = sessions.length > 0 ? totalUsagePercent / sessions.length : 0;

  return {
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens,
    averageUsagePercent: Math.round(averageUsagePercent),
  };
}
