/**
 * Auth Routes
 *
 * OAuth 기반 인증 엔드포인트
 */

import { Router } from 'express';
import { prisma, redis } from '../index.js';
import {
  authenticateToken,
  AuthenticatedRequest,
  signToken,
  isSuperAdmin,
  checkAdminStatus,
} from '../middleware/auth.js';
import { trackActiveUser } from '../services/redis.service.js';

export const authRoutes = Router();

/**
 * GET /auth/me
 * 현재 사용자 정보 조회
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

    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() },
    });

    await trackActiveUser(redis, user.loginid);

    const primaryTeam = user.teamMemberships[0]?.team;

    // Admin 체크 (DB 기반)
    let superAdmin = isSuperAdmin(user.loginid);
    if (!superAdmin && user.email) {
      const { isAdmin, adminRole } = await checkAdminStatus(user.email);
      if (isAdmin && adminRole === 'SUPER_ADMIN') superAdmin = true;
    }

    res.json({
      user: {
        id: user.id,
        loginid: user.loginid,
        username: user.username,
        deptname: user.deptname,
        businessUnit: user.businessUnit,
        email: user.email,
        profileImage: user.profileImage,
        provider: user.provider,
        createdAt: user.createdAt,
        lastActive: user.lastActive,
      },
      spaces: {
        personalSpaceId: user.personalSpace?.id || null,
        teamSpaceId: primaryTeam?.space?.id || null,
        teamId: primaryTeam?.id || null,
        teamName: primaryTeam?.displayName || null,
      },
      isSuperAdmin: superAdmin,
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
 * 세션 유효성 체크
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
        email: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    let superAdmin = isSuperAdmin(user.loginid);
    if (!superAdmin && user.email) {
      const { isAdmin, adminRole } = await checkAdminStatus(user.email);
      if (isAdmin && adminRole === 'SUPER_ADMIN') superAdmin = true;
    }

    res.json({
      valid: true,
      user: {
        id: user.id,
        loginid: user.loginid,
        username: user.username,
        deptname: user.deptname,
      },
      isSuperAdmin: superAdmin,
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
 * 로그아웃
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
