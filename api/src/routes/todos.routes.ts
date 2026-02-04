/**
 * Todos Routes
 *
 * 개인 공간 Todo 관리 엔드포인트
 */

import { Router } from 'express';
import { prisma } from '../index.js';
import { authenticateToken, AuthenticatedRequest, loadUserId } from '../middleware/auth.js';

export const todosRoutes = Router();

todosRoutes.use(authenticateToken);
todosRoutes.use(loadUserId);

/**
 * 현재 KST 기준 날짜 정보 가져오기
 * 서버 시간대에 관계없이 항상 KST(UTC+9) 기준으로 계산
 */
function getKSTDate(dateStr?: string): Date {
  if (dateStr) {
    // YYYY-MM-DD 형식이면 KST 자정으로 해석
    const [y, m, d] = dateStr.split('-').map(Number);
    // KST 자정 = UTC 전날 15:00
    return new Date(Date.UTC(y, m - 1, d, -9, 0, 0, 0));
  }
  return new Date();
}

/**
 * KST 기준 연/월/일 추출
 */
function getKSTParts(date: Date): { year: number; month: number; day: number; dayOfWeek: number } {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth(),
    day: kst.getUTCDate(),
    dayOfWeek: kst.getUTCDay(),
  };
}

/**
 * 날짜 범위 계산 (주/월/년) — KST 기준
 */
function getDateRange(view: string, dateStr?: string): { start: Date; end: Date } {
  const base = getKSTDate(dateStr);
  const { year, month, day, dayOfWeek } = getKSTParts(base);

  if (view === 'week') {
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    // KST 월요일 00:00:00 = UTC (월요일 날짜 - 1) 15:00:00
    const startDay = day + diffToMon;
    const start = new Date(Date.UTC(year, month, startDay, -9, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, startDay + 6, -9 + 23, 59, 59, 999));
    return { start, end };
  }

  if (view === 'month') {
    const start = new Date(Date.UTC(year, month, 1, -9, 0, 0, 0));
    // 다음달 0일 = 이번달 마지막 날
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const end = new Date(Date.UTC(year, month, lastDay, -9 + 23, 59, 59, 999));
    return { start, end };
  }

  // year
  const start = new Date(Date.UTC(year, 0, 1, -9, 0, 0, 0));
  const end = new Date(Date.UTC(year, 11, 31, -9 + 23, 59, 59, 999));
  return { start, end };
}

/**
 * @swagger
 * /todos:
 *   get:
 *     summary: Todo 목록 조회
 *     description: 개인 공간의 Todo를 기간별로 조회합니다.
 *     tags: [Todos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: spaceId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: view
 *         schema:
 *           type: string
 *           enum: [week, month, year]
 *           default: week
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           description: 기준 날짜 (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Todo 목록
 */
todosRoutes.get('/', async (req: AuthenticatedRequest, res) => {
  try {
    const { spaceId, view = 'week', date } = req.query;

    if (!spaceId) {
      res.status(400).json({ error: 'spaceId is required' });
      return;
    }

    // 개인 공간 확인
    const space = await prisma.space.findUnique({
      where: { id: spaceId as string },
      select: { userId: true },
    });

    if (!space) {
      res.status(404).json({ error: 'Space not found' });
      return;
    }

    if (!space.userId) {
      res.status(400).json({ error: 'Todos are only available in personal spaces' });
      return;
    }

    if (space.userId !== req.userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const validViews = ['week', 'month', 'year'];
    const viewStr = validViews.includes(view as string) ? (view as string) : 'week';
    const { start, end } = getDateRange(viewStr, date as string | undefined);

    // 기간 내에 걸치는 Todo 조회 (startDate <= rangeEnd AND endDate >= rangeStart)
    const todos = await prisma.todo.findMany({
      where: {
        spaceId: spaceId as string,
        userId: req.userId!,
        startDate: { lte: end },
        endDate: { gte: start },
      },
      orderBy: [
        { completed: 'asc' },
        { startDate: 'asc' },
      ],
    });

    res.json({
      todos,
      range: {
        start: start.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }),
        end: end.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }),
        view: viewStr,
      },
    });
  } catch (error) {
    console.error('Get todos error:', error);
    res.status(500).json({ error: 'Failed to get todos' });
  }
});

/**
 * @swagger
 * /todos/{id}:
 *   patch:
 *     summary: Todo 수정
 *     description: Todo의 완료 상태, 제목, 기간 등을 수정합니다.
 *     tags: [Todos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
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
todosRoutes.patch('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { completed, title, content, startDate, endDate } = req.body;

    const todo = await prisma.todo.findUnique({ where: { id } });

    if (!todo) {
      res.status(404).json({ error: 'Todo not found' });
      return;
    }

    if (todo.userId !== req.userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const updateData: Record<string, any> = {};

    if (typeof completed === 'boolean') {
      updateData.completed = completed;
      updateData.completedAt = completed ? new Date() : null;
    }
    if (typeof title === 'string' && title.trim()) {
      updateData.title = title.trim();
    }
    if (typeof content === 'string') {
      updateData.content = content;
    }
    if (startDate) {
      updateData.startDate = new Date(startDate);
    }
    if (endDate) {
      updateData.endDate = new Date(endDate);
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    const updated = await prisma.todo.update({
      where: { id },
      data: updateData,
    });

    res.json({ todo: updated });
  } catch (error) {
    console.error('Update todo error:', error);
    res.status(500).json({ error: 'Failed to update todo' });
  }
});

/**
 * DELETE /todos/:id — Todo 삭제
 */
todosRoutes.delete('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const todo = await prisma.todo.findUnique({ where: { id } });

    if (!todo) {
      res.status(404).json({ error: 'Todo not found' });
      return;
    }

    if (todo.userId !== req.userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    await prisma.todo.delete({ where: { id } });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete todo error:', error);
    res.status(500).json({ error: 'Failed to delete todo' });
  }
});
