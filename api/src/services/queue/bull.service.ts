/**
 * Bull Queue Service
 *
 * BullMQ 기반 작업 큐 관리
 */

import { Queue, Worker, Job } from 'bullmq';
import { redis, prisma, io } from '../../index.js';
import { processInputRequest, processSearchRequest, processRefactorRequest } from './processor.service.js';
import { emitQueueUpdate, emitRequestComplete, emitRequestFailed } from '../../websocket/server.js';

// 큐 설정
const QUEUE_NAME = 'aipo-requests';
const MAX_CONCURRENT_JOBS = 20;

// BullMQ 연결 설정 (REDIS_URL 파싱)
function getRedisConnection() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:16004';
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
  };
}
const connection = getRedisConnection();

// 큐 생성
let queue: Queue | null = null;
let worker: Worker | null = null;

/**
 * 큐 초기화
 */
export function initializeQueue(): void {
  queue = new Queue(QUEUE_NAME, { connection });

  worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { requestId, spaceId, type } = job.data;

      console.log(`[Queue] Processing job ${job.id}: requestId=${requestId}, type=${type}`);

      // 요청 상태 업데이트
      await prisma.request.update({
        where: { id: requestId },
        data: {
          status: 'PROCESSING',
          startedAt: new Date(),
        },
      });

      // 사용자 정보 조회
      const request = await prisma.request.findUnique({
        where: { id: requestId },
        include: {
          user: { select: { loginid: true } },
        },
      });

      if (!request) {
        throw new Error('Request not found');
      }

      try {
        let result;

        switch (type) {
          case 'INPUT':
            result = await processInputRequest(requestId, spaceId, request.input);
            break;
          case 'SEARCH':
            result = await processSearchRequest(requestId, spaceId, request.input);
            break;
          case 'REFACTOR':
            result = await processRefactorRequest(requestId, spaceId, request.input);
            break;
          default:
            throw new Error(`Unknown request type: ${type}`);
        }

        // 성공 처리
        await prisma.request.update({
          where: { id: requestId },
          data: {
            status: 'COMPLETED',
            result: JSON.stringify(result),
            completedAt: new Date(),
          },
        });

        // WebSocket 알림
        emitRequestComplete(io, requestId, request.user.loginid, {
          success: true,
          result: result as Record<string, unknown>,
        });

        return result as Record<string, unknown>;
      } catch (error) {
        console.error(`[Queue] Job ${job.id} failed:`, error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // 실패 처리
        await prisma.request.update({
          where: { id: requestId },
          data: {
            status: 'FAILED',
            error: errorMessage,
            completedAt: new Date(),
          },
        });

        // WebSocket 알림
        emitRequestFailed(io, requestId, request.user.loginid, errorMessage);

        throw error;
      }
    },
    {
      connection,
      concurrency: MAX_CONCURRENT_JOBS,
      // Rate limiting per worker
      limiter: {
        max: 5,
        duration: 1000,
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Queue] Job ${job.id} completed`);
  });

  worker.on('failed', (job, error) => {
    console.error(`[Queue] Job ${job?.id} failed:`, error.message);
  });

  console.log('[Queue] Bull queue initialized');
}

/**
 * 큐에 작업 추가
 */
export async function addToQueue(
  requestId: string,
  spaceId: string,
  type: 'INPUT' | 'SEARCH' | 'REFACTOR'
): Promise<number> {
  if (!queue) {
    throw new Error('Queue not initialized');
  }

  const job = await queue.add(
    `${type}-${requestId}`,
    {
      requestId,
      spaceId,
      type,
    },
    {
      // 같은 공간의 작업은 순차 처리
      jobId: `${spaceId}-${requestId}`,
      // 실패 시 재시도
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    }
  );

  // 큐에서의 위치 계산
  const position = await getQueuePosition(requestId, spaceId);

  return position;
}

/**
 * 큐에서 위치 조회
 */
export async function getQueuePosition(requestId: string, spaceId: string): Promise<number> {
  if (!queue) return -1;

  const jobs = await queue.getJobs(['waiting', 'delayed']);
  const spaceJobs = jobs.filter(j => j.data.spaceId === spaceId);

  const index = spaceJobs.findIndex(j => j.data.requestId === requestId);
  return index === -1 ? spaceJobs.length + 1 : index + 1;
}

/**
 * 요청 취소
 */
export async function cancelRequest(requestId: string, spaceId: string): Promise<boolean> {
  if (!queue) return false;

  const job = await queue.getJob(`${spaceId}-${requestId}`);

  if (job) {
    const state = await job.getState();
    if (state === 'waiting' || state === 'delayed') {
      await job.remove();
      return true;
    }
  }

  return false;
}

/**
 * 큐 상태 조회
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}> {
  if (!queue) {
    return { waiting: 0, active: 0, completed: 0, failed: 0 };
  }

  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}

/**
 * 공간별 큐 상태 조회
 */
export async function getSpaceQueueStats(spaceId: string): Promise<{
  waiting: number;
  processing: number;
}> {
  if (!queue) {
    return { waiting: 0, processing: 0 };
  }

  const [waitingJobs, activeJobs] = await Promise.all([
    queue.getJobs(['waiting', 'delayed']),
    queue.getJobs(['active']),
  ]);

  const waiting = waitingJobs.filter(j => j.data.spaceId === spaceId).length;
  const processing = activeJobs.filter(j => j.data.spaceId === spaceId).length;

  return { waiting, processing };
}
