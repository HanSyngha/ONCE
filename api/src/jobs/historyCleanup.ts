/**
 * History Cleanup Job
 *
 * - 30일 지난 히스토리 자동 삭제
 * - 삭제 7일/1일 전 이메일 알림 발송
 */

import { prisma } from '../db.js';
import { sendHistoryExpiryEmail } from '../services/mail.service.js';

const EXPIRY_DAYS = 30;
const NOTIFY_DAYS = [7, 1]; // 7일 전, 1일 전 알림

/**
 * 만료 예정 히스토리 알림 발송
 */
export async function sendExpiryNotifications(): Promise<void> {
  console.log('[HistoryCleanup] Starting expiry notifications...');

  for (const daysUntilExpiry of NOTIFY_DAYS) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysUntilExpiry);

    // 해당 날짜에 만료되는 히스토리 조회
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const expiringHistories = await prisma.history.findMany({
      where: {
        expiresAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: {
        fileVersion: {
          include: {
            file: {
              select: {
                id: true,
                name: true,
                path: true,
                createdBy: true,
              },
            },
          },
        },
      },
    });

    console.log(`[HistoryCleanup] Found ${expiringHistories.length} histories expiring in ${daysUntilExpiry} days`);

    // 파일별로 그룹화 (같은 파일에 대해 중복 알림 방지)
    const fileMap = new Map<string, {
      file: { id: string; name: string; path: string; createdBy: string };
      historyCount: number;
    }>();

    for (const history of expiringHistories) {
      const fileId = history.fileVersion.file.id;
      const existing = fileMap.get(fileId);
      if (existing) {
        existing.historyCount++;
      } else {
        fileMap.set(fileId, {
          file: history.fileVersion.file,
          historyCount: 1,
        });
      }
    }

    // 각 파일 소유자에게 알림 발송
    for (const [fileId, data] of fileMap) {
      const user = await prisma.user.findFirst({
        where: { loginid: data.file.createdBy },
        select: { loginid: true, username: true },
      });

      if (user) {
        const fileUrl = `${process.env.FRONTEND_URL || 'http://localhost:5090'}/note/${fileId}`;

        await sendHistoryExpiryEmail(
          user.loginid,
          user.username,
          data.file.name,
          data.file.path,
          daysUntilExpiry,
          fileUrl
        );

        console.log(`[HistoryCleanup] Sent expiry notification to ${user.loginid} for file ${data.file.name}`);
      }
    }
  }

  console.log('[HistoryCleanup] Expiry notifications completed.');
}

/**
 * 만료된 히스토리 삭제
 */
export async function cleanupExpiredHistories(): Promise<number> {
  console.log('[HistoryCleanup] Starting cleanup of expired histories...');

  const now = new Date();

  const result = await prisma.history.deleteMany({
    where: {
      expiresAt: {
        lt: now,
      },
    },
  });

  console.log(`[HistoryCleanup] Deleted ${result.count} expired histories.`);
  return result.count;
}

/**
 * 전체 히스토리 정리 작업 실행
 */
export async function runHistoryCleanupJob(): Promise<void> {
  console.log('[HistoryCleanup] Starting history cleanup job...');

  try {
    // 1. 만료 예정 알림 발송
    await sendExpiryNotifications();

    // 2. 만료된 히스토리 삭제
    const deletedCount = await cleanupExpiredHistories();

    console.log(`[HistoryCleanup] Job completed successfully. Deleted ${deletedCount} expired histories.`);
  } catch (error) {
    console.error('[HistoryCleanup] Job failed:', error);
    throw error;
  }
}

/**
 * 30일 후 만료일 계산
 */
export function calculateExpiryDate(): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + EXPIRY_DAYS);
  return expiry;
}
