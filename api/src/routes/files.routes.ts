/**
 * Files Routes
 *
 * 노트/파일 관련 엔드포인트
 */

import { Router } from 'express';
import { prisma } from '../index.js';
import { authenticateToken, AuthenticatedRequest, loadUserId, isSuperAdmin } from '../middleware/auth.js';
import { addToQueue } from '../services/queue/bull.service.js';

export const filesRoutes = Router();

filesRoutes.use(authenticateToken);
filesRoutes.use(loadUserId);

/**
 * 파일 접근 권한 확인
 */
async function canAccessFile(userId: string, loginid: string, fileId: string): Promise<boolean> {
  if (isSuperAdmin(loginid)) return true;

  const file = await prisma.file.findUnique({
    where: { id: fileId },
    include: {
      space: {
        include: {
          user: { select: { id: true } },
          team: {
            include: {
              members: { select: { userId: true } },
            },
          },
        },
      },
    },
  });

  if (!file) return false;

  // 개인 공간
  if (file.space.userId === userId) return true;

  // 팀 공간
  if (file.space.team?.members.some(m => m.userId === userId)) return true;

  return false;
}

/**
 * @swagger
 * /files/{id}:
 *   get:
 *     summary: 노트 상세 조회
 *     description: 노트의 상세 정보와 콘텐츠를 조회합니다.
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 파일 ID
 *       - in: query
 *         name: language
 *         schema:
 *           type: string
 *           enum: [KO, EN, CN]
 *           default: KO
 *         description: 언어 (없으면 KO로 폴백)
 *     responses:
 *       200:
 *         description: 노트 상세
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 file:
 *                   $ref: '#/components/schemas/File'
 *                 version:
 *                   $ref: '#/components/schemas/FileVersion'
 *                 availableLanguages:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       language:
 *                         type: string
 *                       updatedAt:
 *                         type: string
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
filesRoutes.get('/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { language = 'KO' } = req.query;

    const canAccess = await canAccessFile(req.userId!, req.user!.loginid, id);
    if (!canAccess) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const file = await prisma.file.findUnique({
      where: { id },
      include: {
        folder: { select: { id: true, name: true, path: true } },
        space: { select: { id: true, type: true } },
        versions: true,
        _count: {
          select: { comments: true },
        },
      },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // 요청된 언어 버전 찾기
    const version = file.versions.find(v => v.language === language) ||
      file.versions.find(v => v.language === 'KO');

    res.json({
      file: {
        id: file.id,
        name: file.name,
        path: file.path,
        folderId: file.folderId,
        folder: file.folder,
        spaceId: file.spaceId,
        spaceType: file.space.type,
        createdBy: file.createdBy,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        deletedAt: file.deletedAt,
        commentCount: file._count.comments,
      },
      version: version ? {
        id: version.id,
        language: version.language,
        content: version.content,
        updatedAt: version.updatedAt,
      } : null,
      availableLanguages: file.versions.map(v => ({
        language: v.language,
        updatedAt: v.updatedAt,
      })),
    });
  } catch (error) {
    console.error('Get file error:', error);
    res.status(500).json({ error: 'Failed to get file' });
  }
});

/**
 * GET /files/:id/history
 * 노트 히스토리 조회
 */
filesRoutes.get('/:id/history', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { language = 'KO' } = req.query;

    const canAccess = await canAccessFile(req.userId!, req.user!.loginid, id);
    if (!canAccess) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const fileVersion = await prisma.fileVersion.findFirst({
      where: {
        fileId: id,
        language: language as 'KO' | 'EN' | 'CN',
      },
      include: {
        histories: {
          orderBy: { changedAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!fileVersion) {
      res.json({ histories: [] });
      return;
    }

    res.json({
      histories: fileVersion.histories.map(h => ({
        id: h.id,
        content: h.content,
        changedAt: h.changedAt,
        changedBy: h.changedBy,
        expiresAt: h.expiresAt,
      })),
    });
  } catch (error) {
    console.error('Get file history error:', error);
    res.status(500).json({ error: 'Failed to get file history' });
  }
});

/**
 * POST /files/:id/export
 * 마크다운 내보내기
 */
filesRoutes.post('/:id/export', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { language = 'KO', includeComments = false } = req.body;

    const canAccess = await canAccessFile(req.userId!, req.user!.loginid, id);
    if (!canAccess) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const file = await prisma.file.findUnique({
      where: { id },
      include: {
        versions: {
          where: { language: language as 'KO' | 'EN' | 'CN' },
        },
        comments: includeComments ? {
          include: {
            user: { select: { username: true, loginid: true } },
            replies: {
              include: {
                user: { select: { username: true, loginid: true } },
              },
            },
          },
          where: { parentId: null },
          orderBy: { createdAt: 'asc' },
        } : false,
      },
    });

    if (!file || !file.versions[0]) {
      res.status(404).json({ error: 'File or version not found' });
      return;
    }

    // 블록 JSON을 마크다운으로 변환
    const content = file.versions[0].content;
    let markdown = `# ${file.name}\n\n`;

    try {
      const blocks = JSON.parse(content);
      markdown += blocksToMarkdown(blocks);
    } catch {
      markdown += content;
    }

    // 댓글 추가
    if (includeComments && file.comments && file.comments.length > 0) {
      markdown += '\n\n---\n\n## Comments\n\n';
      for (const comment of file.comments as any[]) {
        markdown += `**${comment.user?.username || 'Unknown'}** (${comment.createdAt.toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })}):\n`;
        markdown += `> ${comment.content}\n\n`;

        if (comment.replies) {
          for (const reply of comment.replies) {
            markdown += `  **${reply.user?.username || 'Unknown'}**:\n`;
            markdown += `  > ${reply.content}\n\n`;
          }
        }
      }
    }

    // 감사 로그
    await prisma.auditLog.create({
      data: {
        userId: req.userId!,
        spaceId: file.spaceId,
        action: 'EXPORT_NOTE',
        targetType: 'FILE',
        targetId: file.id,
        details: { language, includeComments },
      },
    });

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}.md"`);
    res.send(markdown);
  } catch (error) {
    console.error('Export file error:', error);
    res.status(500).json({ error: 'Failed to export file' });
  }
});

/**
 * POST /files/:id/share
 * 공유 링크 생성
 */
filesRoutes.post('/:id/share', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const canAccess = await canAccessFile(req.userId!, req.user!.loginid, id);
    if (!canAccess) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const file = await prisma.file.findUnique({
      where: { id },
      select: { id: true, name: true, spaceId: true },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // 공유 링크 URL 생성
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5090';
    const shareUrl = `${baseUrl}/note/${file.id}`;

    // 감사 로그
    await prisma.auditLog.create({
      data: {
        userId: req.userId!,
        spaceId: file.spaceId,
        action: 'SHARE_LINK',
        targetType: 'FILE',
        targetId: file.id,
      },
    });

    res.json({
      shareUrl,
      message: '공유 링크가 생성되었습니다. 로그인한 팀원만 접근할 수 있습니다.',
    });
  } catch (error) {
    console.error('Share file error:', error);
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

/**
 * POST /files/:id/retry-translation/:lang
 * 번역 재시도
 */
filesRoutes.post('/:id/retry-translation/:lang', async (req: AuthenticatedRequest, res) => {
  try {
    const { id, lang } = req.params;

    const canAccess = await canAccessFile(req.userId!, req.user!.loginid, id);
    if (!canAccess) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const targetLang = lang.toUpperCase();
    if (!['EN', 'CN'].includes(targetLang)) {
      res.status(400).json({ error: 'Invalid language. Use EN or CN.' });
      return;
    }

    const file = await prisma.file.findUnique({
      where: { id },
      include: {
        versions: {
          where: { language: 'KO' },
        },
      },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const koVersion = file.versions[0];
    if (!koVersion) {
      res.status(400).json({ error: 'Korean version not found for translation' });
      return;
    }

    // 번역 요청 생성
    const request = await prisma.request.create({
      data: {
        userId: req.userId!,
        spaceId: file.spaceId,
        type: 'INPUT',
        input: JSON.stringify({
          action: 'translate',
          fileId: id,
          sourceLang: 'KO',
          targetLang,
          content: koVersion.content,
        }),
        status: 'PENDING',
      },
    });

    // 큐에 추가
    await addToQueue(request.id, file.spaceId, 'INPUT');

    // 감사 로그
    await prisma.auditLog.create({
      data: {
        userId: req.userId!,
        spaceId: file.spaceId,
        action: 'UPDATE_NOTE',
        targetType: 'FILE',
        targetId: file.id,
        details: { action: 'retry_translation', targetLang },
      },
    });

    res.json({
      success: true,
      requestId: request.id,
      message: `${targetLang} 번역 작업이 큐에 추가되었습니다.`,
    });
  } catch (error) {
    console.error('Retry translation error:', error);
    res.status(500).json({ error: 'Failed to retry translation' });
  }
});

/**
 * POST /files/:id/trash
 * 파일을 휴지통으로 이동 (soft delete)
 * 권한: Super Admin / Team Admin / 파일 본인 소유
 */
filesRoutes.post('/:id/trash', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const loginid = req.user!.loginid;

    // 기본 접근 권한 확인 (공간 멤버십)
    const canAccess = await canAccessFile(req.userId!, loginid, id);
    if (!canAccess) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const file = await prisma.file.findUnique({
      where: { id },
      include: {
        space: {
          include: {
            team: {
              include: {
                admins: { select: { userId: true } },
              },
            },
          },
        },
      },
    });

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (file.deletedAt) {
      res.status(400).json({ error: 'File is already in trash' });
      return;
    }

    // 권한 체크
    const superAdmin = isSuperAdmin(loginid);
    const isOwner = file.createdBy === loginid;
    const isTeamAdmin = file.space.team?.admins.some(a => a.userId === req.userId) ?? false;

    if (!superAdmin && !isTeamAdmin && !isOwner) {
      res.status(403).json({ error: 'Permission denied' });
      return;
    }

    await prisma.file.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // 감사 로그
    await prisma.auditLog.create({
      data: {
        userId: req.userId!,
        spaceId: file.spaceId,
        action: 'DELETE_NOTE',
        targetType: 'FILE',
        targetId: file.id,
        details: { movedToTrash: true },
      },
    });

    res.json({ message: 'File moved to trash' });
  } catch (error) {
    console.error('Trash file error:', error);
    res.status(500).json({ error: 'Failed to move file to trash' });
  }
});

/**
 * DELETE /folders/:id
 * 폴더 삭제 (하위 파일은 휴지통으로, 하위 폴더는 재귀 삭제)
 * - 개인 공간: 본인만
 * - 팀 공간: Super Admin 또는 Team Admin
 */
filesRoutes.delete('/folders/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const folder = await prisma.folder.findUnique({
      where: { id },
      include: {
        space: {
          select: {
            id: true,
            userId: true,
            teamId: true,
            team: {
              select: {
                admins: { select: { userId: true } },
              },
            },
          },
        },
      },
    });

    if (!folder) {
      res.status(404).json({ error: 'Folder not found' });
      return;
    }

    const isPersonalSpace = folder.space.userId != null;
    const superAdmin = isSuperAdmin(req.user!.loginid);

    if (isPersonalSpace) {
      // 개인 공간: 본인만 삭제 가능
      if (folder.space.userId !== req.userId) {
        res.status(403).json({ error: 'Permission denied' });
        return;
      }
    } else {
      // 팀 공간: Super Admin 또는 Team Admin만 삭제 가능
      const isTeamAdmin = folder.space.team?.admins.some(a => a.userId === req.userId) ?? false;
      if (!superAdmin && !isTeamAdmin) {
        res.status(403).json({ error: 'Only admin can delete team folders' });
        return;
      }
    }

    // 재귀적으로 하위 파일 soft delete + 폴더 hard delete
    const deletedFileCount = await deleteFolderRecursive(folder.id);

    // 감사 로그
    await prisma.auditLog.create({
      data: {
        userId: req.userId!,
        spaceId: folder.space.id,
        action: 'DELETE_FOLDER',
        targetType: 'FOLDER',
        targetId: folder.id,
        details: { path: folder.path, deletedFileCount },
      },
    });

    res.json({ message: 'Folder deleted', deletedFileCount });
  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

/**
 * 폴더 재귀 삭제: 하위 파일 soft delete, 하위 폴더 재귀 처리 후 폴더 hard delete
 */
async function deleteFolderRecursive(folderId: string): Promise<number> {
  let deletedFileCount = 0;

  // 하위 파일 soft delete (휴지통으로)
  const files = await prisma.file.findMany({
    where: { folderId, deletedAt: null },
    select: { id: true },
  });

  if (files.length > 0) {
    await prisma.file.updateMany({
      where: { folderId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    deletedFileCount += files.length;
  }

  // 하위 폴더 재귀 처리
  const childFolders = await prisma.folder.findMany({
    where: { parentId: folderId },
    select: { id: true },
  });

  for (const child of childFolders) {
    deletedFileCount += await deleteFolderRecursive(child.id);
  }

  // 폴더 자체 hard delete
  await prisma.folder.delete({ where: { id: folderId } });

  return deletedFileCount;
}

/**
 * 블록 배열을 마크다운으로 변환
 */
function blocksToMarkdown(blocks: any[]): string {
  if (!Array.isArray(blocks)) return '';

  return blocks.map(block => {
    switch (block.type) {
      case 'paragraph':
        return block.content?.map((c: any) => c.text || '').join('') + '\n\n';

      case 'heading':
        const level = block.props?.level || 1;
        const prefix = '#'.repeat(level);
        const text = block.content?.map((c: any) => c.text || '').join('') || '';
        return `${prefix} ${text}\n\n`;

      case 'bulletListItem':
        return `- ${block.content?.map((c: any) => c.text || '').join('')}\n`;

      case 'numberedListItem':
        return `1. ${block.content?.map((c: any) => c.text || '').join('')}\n`;

      case 'checkListItem':
        const checked = block.props?.checked ? '[x]' : '[ ]';
        return `- ${checked} ${block.content?.map((c: any) => c.text || '').join('')}\n`;

      case 'codeBlock':
        const lang = block.props?.language || '';
        const code = block.content?.map((c: any) => c.text || '').join('') || '';
        return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;

      case 'table':
        // 간단한 테이블 변환
        if (block.content?.rows) {
          const rows = block.content.rows.map((row: any[]) =>
            '| ' + row.map((cell: any) =>
              cell.map((c: any) => c.text || '').join('')
            ).join(' | ') + ' |'
          );
          if (rows.length > 0) {
            const header = rows[0];
            const separator = '| ' + rows[0].split('|').slice(1, -1).map(() => '---').join(' | ') + ' |';
            return [header, separator, ...rows.slice(1)].join('\n') + '\n\n';
          }
        }
        return '';

      default:
        if (block.content) {
          return block.content.map((c: any) => c.text || '').join('') + '\n\n';
        }
        return '';
    }
  }).join('');
}
