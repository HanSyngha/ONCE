/**
 * Auth Routes
 *
 * SSO 기반 인증 엔드포인트
 */

import { Router } from 'express';
import { prisma, redis } from '../index.js';
import {
  authenticateToken,
  AuthenticatedRequest,
  signToken,
  isSuperAdmin,
  extractBusinessUnit,
  extractTeamName,
} from '../middleware/auth.js';
import { trackActiveUser } from '../services/redis.service.js';

export const authRoutes = Router();

/**
 * URL 인코딩된 텍스트 디코딩
 */
function safeDecodeURIComponent(text: string): string {
  if (!text) return text;
  try {
    if (!text.includes('%')) return text;
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * 사용자 및 공간 초기화
 */
async function initializeUserAndSpaces(
  loginid: string,
  username: string,
  deptname: string
): Promise<{
  user: {
    id: string;
    loginid: string;
    username: string;
    deptname: string;
    businessUnit: string;
  };
  personalSpaceId: string | null;
  teamSpaceId: string | null;
  teamId: string | null;
}> {
  const businessUnit = extractBusinessUnit(deptname);
  const teamName = extractTeamName(deptname);

  // 1. 사용자 upsert
  const user = await prisma.user.upsert({
    where: { loginid },
    update: {
      deptname,
      username,
      businessUnit,
      lastActive: new Date(),
    },
    create: {
      loginid,
      deptname,
      username,
      businessUnit,
    },
  });

  // 2. 개인 공간 생성 (없으면)
  let personalSpace = await prisma.space.findUnique({
    where: { userId: user.id },
  });

  if (!personalSpace) {
    personalSpace = await prisma.space.create({
      data: {
        type: 'PERSONAL',
        userId: user.id,
      },
    });
    console.log(`[Auth] Personal space created for ${loginid}`);

    // Todo 폴더 자동 생성
    await prisma.folder.create({
      data: {
        name: 'Todo',
        path: '/Todo',
        spaceId: personalSpace.id,
      },
    });
    console.log(`[Auth] Todo folder created for ${loginid}`);
  }

  // 3. 팀 조회 또는 생성
  let team = await prisma.team.findUnique({
    where: { name: teamName },
    include: { space: true },
  });

  if (!team) {
    team = await prisma.team.create({
      data: {
        name: teamName,
        displayName: teamName,
        businessUnit,
        space: {
          create: {
            type: 'TEAM',
          },
        },
      },
      include: { space: true },
    });
    console.log(`[Auth] Team and space created: ${teamName}`);
  }

  // 4. 팀 멤버십 추가 (없으면)
  const existingMembership = await prisma.teamMember.findUnique({
    where: {
      userId_teamId: {
        userId: user.id,
        teamId: team.id,
      },
    },
  });

  if (!existingMembership) {
    await prisma.teamMember.create({
      data: {
        userId: user.id,
        teamId: team.id,
      },
    });
    console.log(`[Auth] User ${loginid} joined team ${teamName}`);
  }

  return {
    user: {
      id: user.id,
      loginid: user.loginid,
      username: user.username,
      deptname: user.deptname,
      businessUnit: user.businessUnit,
    },
    personalSpaceId: personalSpace.id,
    teamSpaceId: team.space?.id || null,
    teamId: team.id,
  };
}

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: SSO 로그인
 *     description: SSO 토큰으로 로그인하여 세션 토큰을 발급받습니다. 첫 로그인 시 개인/팀 공간이 자동 생성됩니다.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 로그인 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 spaces:
 *                   type: object
 *                   properties:
 *                     personalSpaceId:
 *                       type: string
 *                     teamSpaceId:
 *                       type: string
 *                     teamId:
 *                       type: string
 *                 sessionToken:
 *                   type: string
 *                 isSuperAdmin:
 *                   type: boolean
 *                 isTeamAdmin:
 *                   type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
authRoutes.post('/login', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const loginid = req.user.loginid;
    const deptname = safeDecodeURIComponent(req.user.deptname || '');
    const username = safeDecodeURIComponent(req.user.username || '');

    // 사용자 및 공간 초기화
    const { user, personalSpaceId, teamSpaceId, teamId } = await initializeUserAndSpaces(
      loginid,
      username,
      deptname
    );

    // Redis 활성 사용자 추적
    await trackActiveUser(redis, loginid);

    // 권한 체크
    const superAdmin = isSuperAdmin(loginid);

    // Team Admin 체크
    let isTeamAdmin = false;
    if (teamId) {
      const teamAdmin = await prisma.teamAdmin.findUnique({
        where: {
          userId_teamId: {
            userId: user.id,
            teamId,
          },
        },
      });
      isTeamAdmin = !!teamAdmin;
    }

    // 세션 토큰 발급
    const sessionToken = signToken({ loginid, deptname, username });

    // 감사 로그
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        targetType: 'USER',
        targetId: user.id,
        details: { method: 'sso' },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || null,
      },
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        loginid: user.loginid,
        username: user.username,
        deptname: user.deptname,
        businessUnit: user.businessUnit,
      },
      spaces: {
        personalSpaceId,
        teamSpaceId,
        teamId,
      },
      sessionToken,
      isSuperAdmin: superAdmin,
      isTeamAdmin,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: 현재 사용자 정보 조회
 *     description: 로그인한 사용자의 상세 정보와 공간 정보를 반환합니다.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 사용자 정보
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *                 spaces:
 *                   type: object
 *                 isSuperAdmin:
 *                   type: boolean
 *                 isTeamAdmin:
 *                   type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
authRoutes.get('/me', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { loginid: req.user.loginid },
      include: {
        personalSpace: { select: { id: true } },
        teamMemberships: {
          include: {
            team: {
              include: {
                space: { select: { id: true } },
              },
            },
          },
        },
        teamAdmins: { select: { teamId: true } },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // 마지막 활동 시간 업데이트
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() },
    });

    await trackActiveUser(redis, user.loginid);

    // 첫 번째 팀 (보통 하나)
    const primaryTeam = user.teamMemberships[0]?.team;

    res.json({
      user: {
        id: user.id,
        loginid: user.loginid,
        username: user.username,
        deptname: user.deptname,
        businessUnit: user.businessUnit,
        createdAt: user.createdAt,
        lastActive: user.lastActive,
      },
      spaces: {
        personalSpaceId: user.personalSpace?.id || null,
        teamSpaceId: primaryTeam?.space?.id || null,
        teamId: primaryTeam?.id || null,
        teamName: primaryTeam?.displayName || null,
      },
      isSuperAdmin: isSuperAdmin(user.loginid),
      isTeamAdmin: user.teamAdmins.length > 0,
      teamAdminTeamIds: user.teamAdmins.map(ta => ta.teamId),
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

/**
 * GET /auth/check
 * 세션 유효성 체크 (가벼운 호출)
 */
authRoutes.get('/check', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { loginid: req.user.loginid },
      select: {
        id: true,
        loginid: true,
        username: true,
        deptname: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      valid: true,
      user: {
        id: user.id,
        loginid: user.loginid,
        username: user.username,
        deptname: user.deptname,
      },
      isSuperAdmin: isSuperAdmin(user.loginid),
    });
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(500).json({ error: 'Failed to check auth status' });
  }
});

/**
 * POST /auth/refresh
 * 토큰 갱신
 */
authRoutes.post('/refresh', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { loginid, deptname, username } = req.user;
    const sessionToken = signToken({ loginid, deptname, username });

    res.json({
      success: true,
      sessionToken,
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

/**
 * POST /auth/logout
 * 로그아웃 (감사 로그 기록)
 */
authRoutes.post('/logout', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { loginid: req.user.loginid },
      select: { id: true },
    });

    if (user) {
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'LOGOUT',
          targetType: 'USER',
          targetId: user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] || null,
        },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Failed to logout' });
  }
});
