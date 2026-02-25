/**
 * Queue Processor Service
 *
 * 큐에서 가져온 작업 처리
 */

import { runAgentLoop } from '../llm/agent.service.js';
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

  const result = await runAgentLoop(requestId, spaceId, 'INPUT', input);

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
