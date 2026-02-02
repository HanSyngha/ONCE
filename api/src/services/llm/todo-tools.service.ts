/**
 * Todo Agent Tools Service
 *
 * Todo agent 전용 도구 정의 및 실행
 */

import { prisma } from '../../index.js';

export interface TodoToolResult {
  success: boolean;
  message: string;
  data?: any;
  done?: boolean;
}

/**
 * Todo agent 도구 정의
 */
export function getTodoToolDefinitions() {
  return [
    {
      type: 'function' as const,
      function: {
        name: 'add_todo',
        description: '새로운 Todo(할일)를 추가합니다.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Todo 제목 (간결하게)',
            },
            content: {
              type: 'string',
              description: '상세 내용 (선택)',
            },
            startDate: {
              type: 'string',
              description: '시작일 (YYYY-MM-DD). 미입력 시 오늘.',
            },
            endDate: {
              type: 'string',
              description: '종료일 (YYYY-MM-DD). 미입력 시 오늘로부터 1년 후.',
            },
          },
          required: ['title'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'complete_todo',
        description: '기존 Todo를 완료 처리합니다. 제목으로 매칭합니다.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: '완료할 Todo의 제목 (부분 일치 가능)',
            },
          },
          required: ['title'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'update_todo',
        description: '기존 Todo의 기간을 수정합니다.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: '수정할 Todo의 제목 (부분 일치 가능)',
            },
            startDate: {
              type: 'string',
              description: '새 시작일 (YYYY-MM-DD)',
            },
            endDate: {
              type: 'string',
              description: '새 종료일 (YYYY-MM-DD)',
            },
          },
          required: ['title'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'delete_todo',
        description: '기존 Todo를 삭제합니다. 제목으로 매칭합니다.',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: '삭제할 Todo의 제목 (부분 일치 가능)',
            },
          },
          required: ['title'],
        },
      },
    },
    {
      type: 'function' as const,
      function: {
        name: 'nothing_more_todo',
        description: '더 이상 추가/수정할 Todo가 없을 때 호출합니다. 모든 작업 완료 후 반드시 호출하세요.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
  ];
}

/**
 * Todo 제목으로 검색 (대소문자 무시, 부분 일치)
 * includeCompleted=true이면 완료된 Todo도 포함
 */
async function findTodoByTitle(userId: string, spaceId: string, title: string, includeCompleted = false) {
  const todos = await prisma.todo.findMany({
    where: {
      userId,
      spaceId,
      ...(includeCompleted ? {} : { completed: false }),
    },
    orderBy: { createdAt: 'desc' },
  });

  // 정확한 일치 우선
  const exactMatch = todos.find(
    t => t.title.toLowerCase() === title.toLowerCase()
  );
  if (exactMatch) return exactMatch;

  // 부분 일치
  const partialMatch = todos.find(
    t => t.title.toLowerCase().includes(title.toLowerCase()) ||
         title.toLowerCase().includes(t.title.toLowerCase())
  );
  return partialMatch || null;
}

/**
 * Todo 도구 실행
 */
export async function executeTodoTool(
  userId: string,
  spaceId: string,
  toolName: string,
  args: Record<string, any>
): Promise<TodoToolResult> {
  try {
    switch (toolName) {
      case 'add_todo': {
        const { title, content, startDate, endDate } = args;

        if (!title || !title.trim()) {
          return { success: false, message: 'Title is required' };
        }

        const now = new Date();
        const oneYearLater = new Date();
        oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

        const parsedStart = startDate ? new Date(startDate) : now;
        const parsedEnd = endDate ? new Date(endDate) : oneYearLater;

        // 날짜 유효성 검증
        if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
          return { success: false, message: 'Invalid date format. Use YYYY-MM-DD.' };
        }

        if (parsedEnd < parsedStart) {
          return { success: false, message: 'endDate must be after startDate' };
        }

        // 중복 제목 확인
        const existing = await prisma.todo.findFirst({
          where: {
            userId,
            spaceId,
            title: title.trim(),
            completed: false,
          },
        });

        if (existing) {
          return {
            success: false,
            message: `Todo with same title already exists: "${title.trim()}"`,
          };
        }

        const todo = await prisma.todo.create({
          data: {
            userId,
            spaceId,
            title: title.trim(),
            content: content?.trim() || null,
            startDate: parsedStart,
            endDate: parsedEnd,
          },
        });

        return {
          success: true,
          message: `Todo added: "${todo.title}" (${parsedStart.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })} ~ ${parsedEnd.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })})`,
          data: { todoId: todo.id },
        };
      }

      case 'complete_todo': {
        const { title } = args;

        if (!title || !title.trim()) {
          return { success: false, message: 'Title is required' };
        }

        const todo = await findTodoByTitle(userId, spaceId, title.trim());

        if (!todo) {
          return {
            success: false,
            message: `No matching incomplete todo found for: "${title.trim()}"`,
          };
        }

        await prisma.todo.update({
          where: { id: todo.id },
          data: {
            completed: true,
            completedAt: new Date(),
          },
        });

        return {
          success: true,
          message: `Todo completed: "${todo.title}"`,
          data: { todoId: todo.id },
        };
      }

      case 'update_todo': {
        const { title, startDate, endDate } = args;

        if (!title || !title.trim()) {
          return { success: false, message: 'Title is required' };
        }

        const todo = await findTodoByTitle(userId, spaceId, title.trim());

        if (!todo) {
          return {
            success: false,
            message: `No matching incomplete todo found for: "${title.trim()}"`,
          };
        }

        const updateData: Record<string, any> = {};

        if (startDate) {
          const parsed = new Date(startDate);
          if (isNaN(parsed.getTime())) {
            return { success: false, message: 'Invalid startDate format. Use YYYY-MM-DD.' };
          }
          updateData.startDate = parsed;
        }

        if (endDate) {
          const parsed = new Date(endDate);
          if (isNaN(parsed.getTime())) {
            return { success: false, message: 'Invalid endDate format. Use YYYY-MM-DD.' };
          }
          updateData.endDate = parsed;
        }

        if (Object.keys(updateData).length === 0) {
          return { success: false, message: 'No date fields to update' };
        }

        // 날짜 순서 검증
        const finalStart = updateData.startDate || todo.startDate;
        const finalEnd = updateData.endDate || todo.endDate;
        if (finalEnd < finalStart) {
          return { success: false, message: 'endDate must be after startDate' };
        }

        await prisma.todo.update({
          where: { id: todo.id },
          data: updateData,
        });

        return {
          success: true,
          message: `Todo updated: "${todo.title}" → ${(finalStart as Date).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })} ~ ${(finalEnd as Date).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })}`,
          data: { todoId: todo.id },
        };
      }

      case 'delete_todo': {
        const { title } = args;

        if (!title || !title.trim()) {
          return { success: false, message: 'Title is required' };
        }

        const todoToDelete = await findTodoByTitle(userId, spaceId, title.trim(), true);

        if (!todoToDelete) {
          return {
            success: false,
            message: `No matching todo found for: "${title.trim()}"`,
          };
        }

        await prisma.todo.delete({
          where: { id: todoToDelete.id },
        });

        return {
          success: true,
          message: `Todo deleted: "${todoToDelete.title}"`,
          data: { todoId: todoToDelete.id },
        };
      }

      case 'nothing_more_todo': {
        return {
          success: true,
          message: 'No more todos to process.',
          done: true,
        };
      }

      default:
        return { success: false, message: `Unknown todo tool: ${toolName}` };
    }
  } catch (error) {
    console.error(`[TodoTool] Error executing ${toolName}:`, error);
    return {
      success: false,
      message: `Failed to execute ${toolName}: ${(error as Error).message}`,
    };
  }
}
