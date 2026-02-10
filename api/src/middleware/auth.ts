/**
 * Authentication Middleware (OAuth-based)
 *
 * JWT 인증 및 권한 체크
 * Dashboard(main)과 동일한 OAuth 기반
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../index.js';

export interface JWTPayload {
  loginid: string;
  deptname: string;
  username: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
  userId?: string;
  isSuperAdmin?: boolean;
  isTeamAdmin?: boolean;
  teamAdminTeamIds?: string[];
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-change-in-production';

/**
 * 최초 사용자인지 확인하고, 맞으면 자동 SUPER_ADMIN 등록
 */
export async function ensureFirstUserAdmin(userId: string, email: string | null): Promise<void> {
  if (!email) return;

  const adminCount = await prisma.admin.count();
  if (adminCount > 0) return;

  await prisma.admin.create({
    data: {
      email,
      role: 'SUPER_ADMIN',
    },
  });
  console.log(`[Auth] First user '${email}' auto-promoted to SUPER_ADMIN`);
}

/**
 * Admin인지 확인 (DB 기반)
 */
export async function checkAdminStatus(email: string | null): Promise<{ isAdmin: boolean; adminRole: string | null }> {
  if (!email) return { isAdmin: false, adminRole: null };

  const admin = await prisma.admin.findUnique({
    where: { email },
  });

  if (admin) {
    return { isAdmin: true, adminRole: admin.role };
  }

  return { isAdmin: false, adminRole: null };
}

/**
 * Super Admin 여부 확인 (DB Admin 테이블 + 환경변수 DEVELOPERS)
 */
export function isSuperAdmin(loginid: string): boolean {
  const developers = process.env.DEVELOPERS || '';
  return developers.split(',').map(d => d.trim()).filter(Boolean).includes(loginid);
}

/**
 * deptname에서 businessUnit 추출
 */
export function extractBusinessUnit(deptname: string): string {
  if (!deptname) return '';
  const match = deptname.match(/\(([^)]+)\)/);
  if (match) return match[1];
  const parts = deptname.split('/');
  return parts[0]?.trim() || '';
}

/**
 * deptname에서 팀명 추출
 */
export function extractTeamName(deptname: string): string {
  if (!deptname) return '';
  const match = deptname.match(/^([^(]+)/);
  if (match) return match[1].trim();
  const parts = deptname.split('/');
  return parts[parts.length - 1]?.trim() || deptname;
}

/**
 * 내부 토큰 검증
 */
export function verifyInternalToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * 내부 토큰 발급
 */
export function signToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

/**
 * JWT 토큰 인증 미들웨어 (OAuth JWT만 검증)
 */
export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const payload = verifyInternalToken(token);
    if (!payload || !payload.loginid) {
      res.status(403).json({ error: 'Invalid token' });
      return;
    }

    req.user = payload;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(403).json({ error: 'Invalid token' });
  }
}

/**
 * Super Admin 권한 체크 미들웨어
 */
export async function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // 환경변수 기반 체크
  if (isSuperAdmin(req.user.loginid)) {
    req.isSuperAdmin = true;
    next();
    return;
  }

  // DB Admin 테이블 체크
  const user = await prisma.user.findUnique({
    where: { loginid: req.user.loginid },
    select: { email: true },
  });

  if (user?.email) {
    const { isAdmin, adminRole } = await checkAdminStatus(user.email);
    if (isAdmin && adminRole === 'SUPER_ADMIN') {
      req.isSuperAdmin = true;
      next();
      return;
    }
  }

  res.status(403).json({ error: 'Super admin access required' });
}

/**
 * Team Admin 또는 Super Admin 권한 체크 미들웨어
 */
export async function requireTeamAdminOrHigher(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Super Admin은 모든 권한
  if (isSuperAdmin(req.user.loginid)) {
    req.isSuperAdmin = true;
    next();
    return;
  }

  // DB Admin 체크
  const user = await prisma.user.findUnique({
    where: { loginid: req.user.loginid },
    include: {
      teamAdmins: {
        select: { teamId: true },
      },
    },
  });

  if (user?.email) {
    const { isAdmin } = await checkAdminStatus(user.email);
    if (isAdmin) {
      req.isSuperAdmin = true;
      next();
      return;
    }
  }

  if (user && user.teamAdmins.length > 0) {
    req.isTeamAdmin = true;
    req.teamAdminTeamIds = user.teamAdmins.map((ta: { teamId: string }) => ta.teamId);
    next();
    return;
  }

  res.status(403).json({ error: 'Team admin or higher access required' });
}

/**
 * 사용자 ID 로드 미들웨어 (인증 후 사용)
 */
export async function loadUserId(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { loginid: req.user.loginid },
      select: { id: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    req.userId = user.id;
    next();
  } catch (error) {
    console.error('Load user ID error:', error);
    res.status(500).json({ error: 'Failed to load user' });
  }
}
