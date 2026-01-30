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
 * 날짜 범위 계산 (주/월/년)
 */
function getDateRange(view: string, dateStr?: string): { start: Date; end: Date } {
  const base = dateStr ? new Date(dateStr) : new Date();
  // 시간대를 한국 기준으로 맞춤 (UTC+9)
  const koreaOffset = 9 * 60 * 60 * 1000;

  if (view === 'week') {
    const day = base.getDay(); // 0=일, 1=월, ...
    const diffToMon = day === 0 ? -6 : 1 - day; // 월요일로 맞춤
    const start = new Date(base);
    start.setDate(base.getDate() + diffToMon);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (view === 'month') {
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  // year
  const start = new Date(base.getFullYear(), 0, 1);
  const end = new Date(base.getFullYear(), 11, 31, 23, 59, 59, 999);
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
        start: start.toISOString(),
        end: end.toISOString(),
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
