/**
 * Requests Routes
 *
 * 노트 입력/검색 요청 관련 엔드포인트
 */

import { Router } from 'express';
import { prisma, io, redis } from '../index.js';
import { authenticateToken, AuthenticatedRequest, loadUserId, isSuperAdmin } from '../middleware/auth.js';
import { inputRateLimiter, searchRateLimiter, quickAddInputRateLimiter, quickAddSearchRateLimiter } from '../middleware/rateLimit.js';
import { addToQueue, getQueuePosition, cancelRequest } from '../services/queue/bull.service.js';
import { resolveUserAnswer } from '../services/llm/agent.service.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://a2g.samsungds.net:16001';

export const requestsRoutes = Router();
export const quickAddRoutes = Router();

requestsRoutes.use(authenticateToken);
requestsRoutes.use(loadUserId);

/**
 * 공간 접근 권한 확인
 */
async function canAccessSpace(userId: string, loginid: string, spaceId: string): Promise<boolean> {
  if (isSuperAdmin(loginid)) return true;

  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    include: {
      user: { select: { id: true } },
      team: {
        include: {
          members: { select: { userId: true } },
        },
      },
    },
  });

  if (!space) return false;
  if (space.userId === userId) return true;
  if (space.team?.members.some(m => m.userId === userId)) return true;

  return false;
}

/**
 * @swagger
 * /requests/input:
 *   post:
 *     summary: 노트 입력 요청 (뭐든지 입력)
 *     description: |
 *       자유 형식의 텍스트를 입력하면 AI가 자동으로 정리하여 노트를 생성합니다.
 *       Rate Limit: **분당 5회**
 *     tags: [Requests]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - spaceId
 *               - input
 *             properties:
 *               spaceId:
 *                 type: string
 *                 description: 저장할 공간 ID
 *               input:
 *                 type: string
 *                 description: 정리할 내용 (최대 100,000자)
 *           example:
 *             spaceId: "clxxx..."
 *             input: "오늘 회의 내용 정리해줘. 참석자는 김팀장, 이과장..."
 *     responses:
 *       200:
 *         description: 요청 생성 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 request:
 *                   $ref: '#/components/schemas/Request'
 *       400:
 *         description: 잘못된 요청
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 */
requestsRoutes.post('/input', inputRateLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const { spaceId, input } = req.body;

    if (!spaceId || !input) {
      res.status(400).json({ error: 'spaceId and input are required' });
      return;
    }

    if (input.length > 100000) {
      res.status(400).json({ error: 'Input is too long. Maximum 100,000 characters.' });
      return;
    }

    const canAccess = await canAccessSpace(req.userId!, req.user!.loginid, spaceId);
    if (!canAccess) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // 요청 생성
    const request = await prisma.request.create({
      data: {
        userId: req.userId!,
        spaceId,
        type: 'INPUT',
        input,
        status: 'PENDING',
      },
    });

    // 큐에 추가
    const position = await addToQueue(request.id, spaceId, 'INPUT');

    // 감사 로그
    await prisma.auditLog.create({
      data: {
        userId: req.userId!,
        spaceId,
        action: 'CREATE_NOTE',
        targetType: 'REQUEST',
        targetId: request.id,
        details: { inputLength: input.length },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || null,
      },
    });

    // WebSocket으로 큐 상태 전송
    io.to(`user:${req.userId}`).emit('queue:update', {
      requestId: request.id,
      position,
      status: 'waiting',
    });

    res.status(201).json({
      request: {
        id: request.id,
        status: request.status,
        position,
        createdAt: request.createdAt,
      },
      message: '입력이 접수되었습니다. 잠시 후 AI가 정리해드립니다.',
    });
  } catch (error) {
    console.error('Input request error:', error);
    res.status(500).json({ error: 'Failed to process input request' });
  }
});

/**
 * POST /requests/search
 * 검색 요청 (뭐든지 검색)
 */
requestsRoutes.post('/search', searchRateLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const { spaceId, query } = req.body;

    if (!spaceId || !query) {
      res.status(400).json({ error: 'spaceId and query are required' });
      return;
    }

    if (query.length > 1000) {
      res.status(400).json({ error: 'Query is too long. Maximum 1,000 characters.' });
      return;
    }

    const canAccess = await canAccessSpace(req.userId!, req.user!.loginid, spaceId);
    if (!canAccess) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // 요청 생성
    const request = await prisma.request.create({
      data: {
        userId: req.userId!,
        spaceId,
        type: 'SEARCH',
        input: query,
        status: 'PENDING',
      },
    });

    // 큐에 추가
    const position = await addToQueue(request.id, spaceId, 'SEARCH');

    res.status(201).json({
      request: {
        id: request.id,
        status: request.status,
        position,
        createdAt: request.createdAt,
      },
      message: '검색을 시작합니다.',
    });
  } catch (error) {
    console.error('Search request error:', error);
    res.status(500).json({ error: 'Failed to process search request' });
  }
});

/**
 * POST /requests/refactor
 * 폴더 구조 리팩토링 요청
 * - 개인 공간: 본인이 직접 요청 가능
 * - 팀 공간: Super Admin 또는 Team Admin만
 */
requestsRoutes.post('/refactor', async (req: AuthenticatedRequest, res) => {
  try {
    const { spaceId, instructions } = req.body;

    if (!spaceId) {
      res.status(400).json({ error: 'spaceId is required' });
      return;
    }

    // 공간 접근 권한 확인
    const canAccess = await canAccessSpace(req.userId!, req.user!.loginid, spaceId);
    if (!canAccess) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // 공간 타입 확인
    const space = await prisma.space.findUnique({
      where: { id: spaceId },
      select: { userId: true, teamId: true },
    });

    if (!space) {
      res.status(404).json({ error: 'Space not found' });
      return;
    }

    const isPersonalSpace = space.userId === req.userId;

    // 팀 공간: Super Admin 또는 Team Admin만 허용
    if (!isPersonalSpace && !isSuperAdmin(req.user!.loginid)) {
      const user = await prisma.user.findUnique({
        where: { loginid: req.user!.loginid },
        include: { teamAdmins: { select: { teamId: true } } },
      });

      const isTeamAdmin = user?.teamAdmins.some((ta: { teamId: string }) => ta.teamId === space.teamId);
      if (!isTeamAdmin) {
        res.status(403).json({ error: 'Team admin or higher access required for team space' });
        return;
      }
    }

    // 요청 생성
    const request = await prisma.request.create({
      data: {
        userId: req.userId!,
        spaceId,
        type: 'REFACTOR',
        input: instructions || 'Optimize folder structure',
        status: 'PENDING',
      },
    });

    // 큐에 추가
    const position = await addToQueue(request.id, spaceId, 'REFACTOR');

    // 감사 로그
    await prisma.auditLog.create({
      data: {
        userId: req.userId!,
        spaceId,
        action: 'REFACTOR_STRUCTURE',
        targetType: 'SPACE',
        targetId: spaceId,
        details: { requestId: request.id },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || null,
      },
    });

    res.status(201).json({
      request: {
        id: request.id,
        status: request.status,
        position,
        createdAt: request.createdAt,
      },
      message: '폴더 구조 최적화 작업이 시작됩니다. 완료 시 알려드립니다.',
    });
  } catch (error) {
    console.error('Refactor request error:', error);
    res.status(500).json({ error: 'Failed to process refactor request' });
  }
});

/**
 * GET /requests/queue-status
 * 큐 전체 상태 조회
 * NOTE: 이 라우트는 반드시 GET /:id 보다 먼저 선언해야 함 (Express 라우트 매칭 순서)
 */
requestsRoutes.get('/queue-status', async (req: AuthenticatedRequest, res) => {
  try {
    const { spaceId } = req.query;

    if (!spaceId) {
      res.status(400).json({ error: 'spaceId is required' });
      return;
    }

    const canAccess = await canAccessSpace(req.userId!, req.user!.loginid, spaceId as string);
    if (!canAccess) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // 대기 중 & 처리 중 요청 조회
    const pending = await prisma.request.count({
      where: { spaceId: spaceId as string, status: 'PENDING' },
    });

    const processing = await prisma.request.count({
      where: { spaceId: spaceId as string, status: 'PROCESSING' },
    });

    res.json({
      queue: {
        pending,
        processing,
        total: pending + processing,
      },
    });
  } catch (error) {
    console.error('Get queue status error:', error);
    res.status(500).json({ error: 'Failed to get queue status' });
  }
});

/**
 * GET /requests/:id
 * 요청 상태 조회
 */
requestsRoutes.get('/:id', async (req: AuthenticatedRequest, res) => {
  // polling fallback에서 304 캐시로 pendingQuestion을 놓치는 것 방지
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.removeHeader('ETag');

  try {
    const { id } = req.params;

    const request = await prisma.request.findUnique({
      where: { id },
      include: {
        logs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    // 본인 요청만 조회 가능 (Super Admin 제외)
    if (!isSuperAdmin(req.user!.loginid) && request.userId !== req.userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // 큐에서 현재 위치 조회
    let position: number | null = null;
    if (request.status === 'PENDING') {
      position = await getQueuePosition(request.id, request.spaceId);
    }

    // ask_to_user 대기 중인 질문이 있는지 Redis 확인
    let pendingQuestion = null;
    if (request.status === 'PROCESSING') {
      const askData = await redis.get(`ask_user:${request.id}`);
      if (askData) {
        try {
          pendingQuestion = JSON.parse(askData);
        } catch { /* ignore */ }
      }
    }

    res.json({
      request: {
        id: request.id,
        type: request.type,
        status: request.status,
        position,
        input: request.input.substring(0, 200) + (request.input.length > 200 ? '...' : ''),
        result: request.result,
        error: request.error,
        iterations: request.iterations,
        tokensUsed: request.tokensUsed,
        createdAt: request.createdAt,
        startedAt: request.startedAt,
        completedAt: request.completedAt,
        pendingQuestion,
      },
      logs: request.logs.map(log => ({
        id: log.id,
        iteration: log.iteration,
        tool: log.tool,
        success: log.success,
        duration: log.duration,
        createdAt: log.createdAt,
      })),
    });
  } catch (error) {
    console.error('Get request error:', error);
    res.status(500).json({ error: 'Failed to get request' });
  }
});

/**
 * POST /requests/:id/answer
 * 사용자 질문 응답 (ask_to_user)
 */
requestsRoutes.post('/:id/answer', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { answer } = req.body;

    if (!answer) {
      res.status(400).json({ error: 'answer is required' });
      return;
    }

    // 본인 요청인지 확인
    const request = await prisma.request.findUnique({ where: { id } });
    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    if (request.userId !== req.userId && !isSuperAdmin(req.user!.loginid)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const resolved = resolveUserAnswer(id, answer);
    if (!resolved) {
      res.status(404).json({ error: 'No pending question for this request' });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Answer question error:', error);
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

/**
 * DELETE /requests/:id
 * 요청 취소 (대기 중인 요청만)
 */
requestsRoutes.delete('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const request = await prisma.request.findUnique({
      where: { id },
    });

    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }

    if (!isSuperAdmin(req.user!.loginid) && request.userId !== req.userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    if (request.status !== 'PENDING') {
      res.status(400).json({ error: 'Only pending requests can be cancelled' });
      return;
    }

    // 큐에서 제거
    await cancelRequest(request.id, request.spaceId);

    // 상태 업데이트
    await prisma.request.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    res.json({
      success: true,
      message: '요청이 취소되었습니다.',
    });
  } catch (error) {
    console.error('Cancel request error:', error);
    res.status(500).json({ error: 'Failed to cancel request' });
  }
});

// ==================== Quick Add 공통 유틸 ====================

const USER_NOT_FOUND_ERROR = {
  error: '사용자를 찾을 수 없습니다. 이 API를 사용하려면 먼저 ONCE에 로그인해야 합니다.',
  action: '아래 링크에 접속하여 SSO 로그인을 완료한 후 다시 시도해주세요. 로그인 전에는 이 API를 사용할 수 없습니다.',
  loginUrl: FRONTEND_URL,
};

/**
 * 요청 완료까지 대기 (동기 실행용)
 * DB를 500ms 간격으로 폴링하여 COMPLETED/FAILED/CANCELLED 상태가 될 때까지 대기
 */
async function waitForRequestCompletion(
  requestId: string,
  timeoutMs: number = 120000
): Promise<{ status: string; result: string | null; error: string | null; iterations: number; tokensUsed: number }> {
  const pollInterval = 500;
  const maxAttempts = Math.ceil(timeoutMs / pollInterval);

  for (let i = 0; i < maxAttempts; i++) {
    const request = await prisma.request.findUnique({
      where: { id: requestId },
      select: { status: true, result: true, error: true, iterations: true, tokensUsed: true },
    });

    if (!request) throw new Error('Request not found');

    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(request.status)) {
      return request;
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  return { status: 'TIMEOUT', result: null, error: '요청 처리 시간이 초과되었습니다 (2분). 잠시 후 다시 시도해주세요.', iterations: 0, tokensUsed: 0 };
}

/**
 * loginid로 사용자 + 개인 공간 조회 (공통)
 */
async function findUserWithSpace(loginid: string) {
  return prisma.user.findUnique({
    where: { loginid },
    include: { personalSpace: { select: { id: true } } },
  });
}

// ==================== Quick Add Routes ====================

/**
 * @swagger
 * /quick-add:
 *   post:
 *     summary: 아무거나 추가 (개인 공간)
 *     description: |
 *       loginid로 사용자를 식별하여 개인 공간에 노트를 추가합니다.
 *       AI가 노트를 정리 완료할 때까지 대기한 후 결과를 반환합니다.
 *       인증 없이 사용 가능합니다.
 *     tags: [Quick Add]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - input
 *             properties:
 *               id:
 *                 type: string
 *                 description: 사용자 loginid
 *               input:
 *                 type: string
 *                 description: 정리할 내용 (최대 100,000자)
 *           example:
 *             id: "hong.gildong"
 *             input: "오늘 회의 내용 정리해줘..."
 *     responses:
 *       200:
 *         description: 노트 생성 완료
 *       400:
 *         description: 잘못된 요청
 *       404:
 *         description: 사용자를 찾을 수 없음 (ONCE 로그인 필요)
 */
quickAddRoutes.post('/', quickAddInputRateLimiter, async (req, res) => {
  try {
    const { id, input } = req.body;

    if (!id || !input) {
      res.status(400).json({ error: 'id and input are required' });
      return;
    }

    if (input.length > 100000) {
      res.status(400).json({ error: 'Input is too long. Maximum 100,000 characters.' });
      return;
    }

    const user = await findUserWithSpace(id);
    if (!user || !user.personalSpace) {
      res.status(404).json(USER_NOT_FOUND_ERROR);
      return;
    }

    const spaceId = user.personalSpace.id;

    // 요청 생성
    const request = await prisma.request.create({
      data: {
        userId: user.id,
        spaceId,
        type: 'INPUT',
        input,
        status: 'PENDING',
      },
    });

    // 큐에 추가
    const position = await addToQueue(request.id, spaceId, 'INPUT');

    // WebSocket으로 큐 상태 전송 (웹 UI 연동)
    io.to(`user:${user.id}`).emit('queue:update', {
      requestId: request.id,
      position,
      status: 'waiting',
    });

    // 감사 로그
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        spaceId,
        action: 'CREATE_NOTE',
        targetType: 'REQUEST',
        targetId: request.id,
        details: { inputLength: input.length, source: 'quick-add' },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || null,
      },
    });

    // 완료까지 대기
    const completed = await waitForRequestCompletion(request.id);

    if (completed.status === 'COMPLETED' && completed.result) {
      let parsedResult;
      try { parsedResult = JSON.parse(completed.result); } catch { parsedResult = {}; }

      const filesCreated = parsedResult.filesCreated || [];
      const summary = parsedResult.summary || '';

      res.json({
        success: true,
        request: {
          id: request.id,
          status: 'COMPLETED',
          iterations: completed.iterations,
          tokensUsed: completed.tokensUsed,
        },
        result: {
          filesCreated,
          foldersCreated: parsedResult.foldersCreated || [],
          summary,
        },
        message: `노트가 생성되었습니다. ${filesCreated.length}개의 파일이 생성되었습니다.${summary ? ' 요약: ' + summary : ''}`,
        url: FRONTEND_URL,
      });
    } else {
      const errorMsg = completed.error || '알 수 없는 오류가 발생했습니다.';
      res.status(completed.status === 'TIMEOUT' ? 504 : 500).json({
        success: false,
        request: { id: request.id, status: completed.status },
        error: `노트 생성에 실패했습니다: ${errorMsg}`,
      });
    }
  } catch (error) {
    console.error('Quick add error:', error);
    res.status(500).json({ success: false, error: 'Failed to process quick add request' });
  }
});

/**
 * @swagger
 * /quick-add/todo:
 *   post:
 *     summary: Todo 직접 추가 (개인 공간)
 *     description: |
 *       loginid로 사용자를 식별하여 개인 공간에 Todo를 추가합니다.
 *       인증 없이 사용 가능합니다.
 *     tags: [Quick Add]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - title
 *             properties:
 *               id:
 *                 type: string
 *                 description: 사용자 loginid
 *               title:
 *                 type: string
 *                 description: Todo 제목
 *               content:
 *                 type: string
 *                 description: 상세 내용 (선택)
 *               startDate:
 *                 type: string
 *                 description: 시작일 YYYY-MM-DD (선택, 기본 오늘)
 *               endDate:
 *                 type: string
 *                 description: 종료일 YYYY-MM-DD (선택, 기본 1년 후)
 *           example:
 *             id: "hong.gildong"
 *             title: "보고서 제출"
 *             endDate: "2026-02-28"
 *     responses:
 *       201:
 *         description: Todo 생성 성공
 *       400:
 *         description: 잘못된 요청
 *       404:
 *         description: 사용자를 찾을 수 없음 (ONCE 로그인 필요)
 */
quickAddRoutes.post('/todo', async (req, res) => {
  try {
    const { id, title, content, startDate, endDate } = req.body;

    if (!id || !title) {
      res.status(400).json({ error: 'id and title are required' });
      return;
    }

    const user = await findUserWithSpace(id);
    if (!user || !user.personalSpace) {
      res.status(404).json(USER_NOT_FOUND_ERROR);
      return;
    }

    const now = new Date();
    const oneYearLater = new Date();
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

    const parsedStart = startDate ? new Date(startDate) : now;
    const parsedEnd = endDate ? new Date(endDate) : oneYearLater;

    if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
      res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
      return;
    }

    if (parsedEnd < parsedStart) {
      res.status(400).json({ error: 'endDate must be after startDate' });
      return;
    }

    const todo = await prisma.todo.create({
      data: {
        userId: user.id,
        spaceId: user.personalSpace.id,
        title: title.trim(),
        content: content?.trim() || null,
        startDate: parsedStart,
        endDate: parsedEnd,
      },
    });

    const startStr = parsedStart.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
    const endStr = parsedEnd.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });

    res.status(201).json({
      success: true,
      todo: {
        id: todo.id,
        title: todo.title,
        content: todo.content,
        startDate: todo.startDate,
        endDate: todo.endDate,
        completed: todo.completed,
        createdAt: todo.createdAt,
      },
      message: `Todo "${todo.title}"이(가) 추가되었습니다. 기간: ${startStr} ~ ${endStr}`,
    });
  } catch (error) {
    console.error('Quick add todo error:', error);
    res.status(500).json({ success: false, error: 'Failed to create todo' });
  }
});

/**
 * @swagger
 * /quick-add/search:
 *   get:
 *     summary: 검색 (개인 공간)
 *     description: |
 *       loginid로 사용자를 식별하여 개인 공간에서 AI 검색합니다.
 *       검색이 완료될 때까지 대기한 후 관련도순 상위 5개 결과를 반환합니다.
 *     tags: [Quick Add]
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 사용자 loginid
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: 검색어 (자연어)
 *     responses:
 *       200:
 *         description: 검색 결과 (관련도순 상위 5개)
 *       400:
 *         description: 잘못된 요청
 *       404:
 *         description: 사용자를 찾을 수 없음 (ONCE 로그인 필요)
 */
quickAddRoutes.get('/search', quickAddSearchRateLimiter, async (req, res) => {
  try {
    const { id, q } = req.query;

    if (!id || !q) {
      res.status(400).json({ error: 'id and q are required' });
      return;
    }

    if ((q as string).length > 1000) {
      res.status(400).json({ error: 'Query is too long. Maximum 1,000 characters.' });
      return;
    }

    const user = await findUserWithSpace(id as string);
    if (!user || !user.personalSpace) {
      res.status(404).json(USER_NOT_FOUND_ERROR);
      return;
    }

    const spaceId = user.personalSpace.id;

    // 요청 생성
    const request = await prisma.request.create({
      data: {
        userId: user.id,
        spaceId,
        type: 'SEARCH',
        input: q as string,
        status: 'PENDING',
      },
    });

    // 큐에 추가
    const position = await addToQueue(request.id, spaceId, 'SEARCH');

    // WebSocket으로 큐 상태 전송 (웹 UI 연동)
    io.to(`user:${user.id}`).emit('queue:update', {
      requestId: request.id,
      position,
      status: 'waiting',
    });

    // 완료까지 대기
    const completed = await waitForRequestCompletion(request.id);

    if (completed.status === 'COMPLETED' && completed.result) {
      let parsedResult;
      try { parsedResult = JSON.parse(completed.result); } catch { parsedResult = { results: [] }; }

      const allResults = parsedResult.results || [];
      // 관련도순 정렬 후 상위 5개
      const top5 = allResults
        .sort((a: { relevanceScore: number }, b: { relevanceScore: number }) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
        .slice(0, 5);

      res.json({
        success: true,
        query: q,
        results: top5,
        totalFound: allResults.length,
        message: allResults.length > 0
          ? `${allResults.length}건 중 상위 ${top5.length}건의 검색 결과를 반환합니다.`
          : `"${q}"에 대한 검색 결과가 없습니다.`,
      });
    } else {
      const errorMsg = completed.error || '알 수 없는 오류가 발생했습니다.';
      res.status(completed.status === 'TIMEOUT' ? 504 : 500).json({
        success: false,
        query: q,
        results: [],
        totalFound: 0,
        error: `검색에 실패했습니다: ${errorMsg}`,
      });
    }
  } catch (error) {
    console.error('Quick search error:', error);
    res.status(500).json({ success: false, error: 'Failed to process search request' });
  }
});

/**
 * @swagger
 * /quick-add/todos:
 *   get:
 *     summary: Todo 목록 조회 (개인 공간)
 *     description: |
 *       loginid로 사용자를 식별하여 개인 공간의 Todo를 조회합니다.
 *     tags: [Quick Add]
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 사용자 loginid
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *         description: 조회 시작일 (YYYY-MM-DD, 기본 오늘)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *         description: 조회 종료일 (YYYY-MM-DD, 기본 1년 후)
 *     responses:
 *       200:
 *         description: Todo 목록
 */
quickAddRoutes.get('/todos', async (req, res) => {
  try {
    const { id, startDate, endDate } = req.query;

    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    const user = await findUserWithSpace(id as string);
    if (!user || !user.personalSpace) {
      res.status(404).json(USER_NOT_FOUND_ERROR);
      return;
    }

    const now = new Date();
    const oneYearLater = new Date();
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

    const start = startDate ? new Date(startDate as string) : now;
    const end = endDate ? new Date(endDate as string) : oneYearLater;

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
      return;
    }

    const todos = await prisma.todo.findMany({
      where: {
        userId: user.id,
        spaceId: user.personalSpace.id,
        startDate: { lte: end },
        endDate: { gte: start },
      },
      orderBy: [
        { completed: 'asc' },
        { startDate: 'asc' },
      ],
      select: {
        id: true,
        title: true,
        content: true,
        startDate: true,
        endDate: true,
        completed: true,
        completedAt: true,
        createdAt: true,
      },
    });

    const completedCount = todos.filter(t => t.completed).length;
    const pendingCount = todos.length - completedCount;
    const startStr = start.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
    const endStr = end.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });

    res.json({
      success: true,
      todos,
      range: {
        start: start.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }),
        end: end.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }),
      },
      total: todos.length,
      completedCount,
      pendingCount,
      message: `${startStr} ~ ${endStr} 기간의 Todo ${todos.length}건 (완료 ${completedCount}건, 미완료 ${pendingCount}건)`,
    });
  } catch (error) {
    console.error('Quick todos list error:', error);
    res.status(500).json({ success: false, error: 'Failed to get todos' });
  }
});

/**
 * @swagger
 * /quick-add/todos:
 *   patch:
 *     summary: Todo 수정 (개인 공간)
 *     description: |
 *       loginid로 사용자를 식별하여 Todo를 수정합니다.
 *     tags: [Quick Add]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - todoId
 *             properties:
 *               id:
 *                 type: string
 *                 description: 사용자 loginid
 *               todoId:
 *                 type: string
 *                 description: Todo ID
 *               completed:
 *                 type: boolean
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               startDate:
 *                 type: string
 *               endDate:
 *                 type: string
 *     responses:
 *       200:
 *         description: 수정된 Todo
 */
quickAddRoutes.patch('/todos', async (req, res) => {
  try {
    const { id, todoId, completed, title, content, startDate, endDate } = req.body;

    if (!id || !todoId) {
      res.status(400).json({ error: 'id and todoId are required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { loginid: id as string },
    });

    if (!user) {
      res.status(404).json(USER_NOT_FOUND_ERROR);
      return;
    }

    const todo = await prisma.todo.findUnique({ where: { id: todoId } });

    if (!todo) {
      res.status(404).json({ error: 'Todo not found' });
      return;
    }

    if (todo.userId !== user.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const updateData: Record<string, any> = {};
    const changedFields: string[] = [];

    if (typeof completed === 'boolean') {
      updateData.completed = completed;
      updateData.completedAt = completed ? new Date() : null;
      changedFields.push(completed ? '완료 처리' : '미완료로 변경');
    }
    if (typeof title === 'string' && title.trim()) {
      updateData.title = title.trim();
      changedFields.push(`제목 → "${title.trim()}"`);
    }
    if (typeof content === 'string') {
      updateData.content = content;
      changedFields.push('내용 수정');
    }
    if (startDate) {
      const parsed = new Date(startDate);
      if (isNaN(parsed.getTime())) {
        res.status(400).json({ error: 'Invalid startDate format. Use YYYY-MM-DD.' });
        return;
      }
      updateData.startDate = parsed;
      changedFields.push(`시작일 → ${startDate}`);
    }
    if (endDate) {
      const parsed = new Date(endDate);
      if (isNaN(parsed.getTime())) {
        res.status(400).json({ error: 'Invalid endDate format. Use YYYY-MM-DD.' });
        return;
      }
      updateData.endDate = parsed;
      changedFields.push(`종료일 → ${endDate}`);
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    const updated = await prisma.todo.update({
      where: { id: todoId },
      data: updateData,
    });

    res.json({
      success: true,
      todo: {
        id: updated.id,
        title: updated.title,
        content: updated.content,
        startDate: updated.startDate,
        endDate: updated.endDate,
        completed: updated.completed,
        completedAt: updated.completedAt,
      },
      changes: changedFields,
      message: `Todo "${updated.title}" 수정 완료: ${changedFields.join(', ')}`,
    });
  } catch (error) {
    console.error('Quick update todo error:', error);
    res.status(500).json({ success: false, error: 'Failed to update todo' });
  }
});
