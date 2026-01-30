/**
 * Queue Processor Service
 *
 * 큐에서 가져온 작업 처리
 */

import { runAgentLoop, runTodoAgentLoop } from '../llm/agent.service.js';
import { prisma } from '../../index.js';

export interface ProcessResult {
  filesCreated: string[];
  filesModified: string[];
  foldersCreated: string[];
  summary?: string;
}

export interface SearchResult {
  results: Array<{
    fileId: string;
    path: string;
    title: string;
    snippet: string;
    relevanceScore: number;
  }>;
}

/**
 * 입력 요청 처리 (뭐든지 입력)
 */
export async function processInputRequest(
  requestId: string,
  spaceId: string,
  input: string
): Promise<ProcessResult> {
  console.log(`[Processor] Processing INPUT request: ${requestId}`);

  // 개인 공간 여부 확인 (Todo agent는 개인 공간에서만 실행)
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { userId: true },
  });

  const request = await prisma.request.findUnique({
    where: { id: requestId },
    select: { userId: true },
  });

  // INPUT agent + Todo agent 병렬 실행
  const [result] = await Promise.all([
    runAgentLoop(requestId, spaceId, 'INPUT', input),
    // 개인 공간인 경우에만 Todo agent 병렬 실행 (실패해도 INPUT에 영향 없음)
    space?.userId && request
      ? runTodoAgentLoop(requestId, request.userId, spaceId, input)
          .catch(err => console.error('[Processor] Todo agent error (non-fatal):', err))
      : Promise.resolve(),
  ]);

  return {
    filesCreated: result.filesCreated || [],
    filesModified: result.filesModified || [],
    foldersCreated: result.foldersCreated || [],
    summary: result.summary,
  };
}

/**
 * 검색 요청 처리 (뭐든지 검색)
 */
export async function processSearchRequest(
  requestId: string,
  spaceId: string,
  query: string
): Promise<SearchResult> {
  console.log(`[Processor] Processing SEARCH request: ${requestId}`);

  const result = await runAgentLoop(requestId, spaceId, 'SEARCH', query);

  return {
    results: result.searchResults || [],
  };
}

/**
 * 리팩토링 요청 처리 (관리자 폴더 구조 변경)
 */
export async function processRefactorRequest(
  requestId: string,
  spaceId: string,
  instructions: string
): Promise<ProcessResult> {
  console.log(`[Processor] Processing REFACTOR request: ${requestId}`);

  const result = await runAgentLoop(requestId, spaceId, 'REFACTOR', instructions);

  return {
    filesCreated: result.filesCreated || [],
    filesModified: result.filesModified || [],
    foldersCreated: result.foldersCreated || [],
    summary: result.summary,
  };
}
