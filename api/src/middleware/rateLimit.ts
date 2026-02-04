/**
 * Rate Limiting Middleware
 *
 * Redis 기반 분당 요청 제한
 */

import { Request, Response, NextFunction } from 'express';
import { redis } from '../index.js';
import { AuthenticatedRequest } from './auth.js';

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  keyPrefix: string;
}

const CONFIGS: Record<string, RateLimitConfig> = {
  input: {
    maxRequests: parseInt(process.env.RATE_LIMIT_INPUT_MAX || '5', 10),
    windowSeconds: 60,
    keyPrefix: 'ratelimit:input',
  },
  search: {
    maxRequests: parseInt(process.env.RATE_LIMIT_SEARCH_MAX || '10', 10),
    windowSeconds: 60,
    keyPrefix: 'ratelimit:search',
  },
};

/**
 * Rate limiter 생성
 */
export function createRateLimiter(type: 'input' | 'search') {
  const config = CONFIGS[type];

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const key = `${config.keyPrefix}:${authReq.user.loginid}`;

    try {
      // Lua script for atomic increment and TTL check
      const script = `
        local current = redis.call('INCR', KEYS[1])
        if current == 1 then
          redis.call('EXPIRE', KEYS[1], ARGV[1])
        end
        return current
      `;

      const count = await redis.eval(
        script,
        1,
        key,
        config.windowSeconds.toString()
      ) as number;

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, config.maxRequests - count));

      const ttl = await redis.ttl(key);
      res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + ttl);

      if (count > config.maxRequests) {
        console.log(`[RateLimit] ${type} exceeded for user ${authReq.user.loginid}: ${count}/${config.maxRequests}`);
        res.status(429).json({
          error: 'Too many requests',
          message: `${type === 'input' ? '입력' : '검색'} 요청은 분당 ${config.maxRequests}회로 제한됩니다.`,
          retryAfter: ttl,
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Rate limit check error:', error);
      // Redis 오류 시 요청 허용 (fail-open)
      next();
    }
  };
}

/**
 * 입력 요청 Rate Limiter (분당 5회)
 */
export const inputRateLimiter = createRateLimiter('input');

/**
 * 검색 요청 Rate Limiter (분당 10회)
 */
export const searchRateLimiter = createRateLimiter('search');

/**
 * Quick-add용 Rate limiter (인증 없이 loginid 기반)
 * req.body.id 또는 req.query.id에서 loginid를 추출하여 제한
 */
export function createQuickAddRateLimiter(type: 'input' | 'search') {
  const config = CONFIGS[type];

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const loginid = (req.body?.id || req.query?.id) as string;

    if (!loginid) {
      // 검증은 핸들러에서 처리 — 여기서는 통과
      next();
      return;
    }

    const key = `${config.keyPrefix}:quickadd:${loginid}`;

    try {
      const script = `
        local current = redis.call('INCR', KEYS[1])
        if current == 1 then
          redis.call('EXPIRE', KEYS[1], ARGV[1])
        end
        return current
      `;

      const count = await redis.eval(
        script,
        1,
        key,
        config.windowSeconds.toString()
      ) as number;

      res.setHeader('X-RateLimit-Limit', config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, config.maxRequests - count));

      const ttl = await redis.ttl(key);
      res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + ttl);

      if (count > config.maxRequests) {
        console.log(`[RateLimit] quickadd:${type} exceeded for ${loginid}: ${count}/${config.maxRequests}`);
        res.status(429).json({
          error: 'Too many requests',
          message: `${type === 'input' ? '입력' : '검색'} 요청은 분당 ${config.maxRequests}회로 제한됩니다. 잠시 후 다시 시도해주세요.`,
          retryAfter: ttl,
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Quick-add rate limit check error:', error);
      next();
    }
  };
}

export const quickAddInputRateLimiter = createQuickAddRateLimiter('input');
export const quickAddSearchRateLimiter = createQuickAddRateLimiter('search');
