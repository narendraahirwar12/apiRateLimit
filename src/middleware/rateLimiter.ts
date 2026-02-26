import Redis from 'ioredis';
import { Request, Response, NextFunction } from 'express';
import AuditLog from '../models/AuditLog';
import logger from '../utils/logger';

// ─── Extend Express Request with custom properties ────────────────────────────
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: string;
        tenantId: string | null;
        username: string;
      };
      isWhitelisted?: boolean;
    }
  }
}

// ─── Redis Client ─────────────────────────────────────────────────────────────
const redisClient = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
});

redisClient.on('connect', () => logger.info('✅ Redis connected'));
redisClient.on('error', (err: Error) => logger.error(`Redis error: ${err.message}`));

// ─── Constants ────────────────────────────────────────────────────────────────
// filter(Boolean) removes empty strings — prevents whitelist bypass bug when WHITELISTED_IPS= is empty
const WHITELISTED_IPS = (process.env.WHITELISTED_IPS || '').split(',').map((ip: string) => ip.trim()).filter(Boolean);
const MAX_VIOLATIONS = parseInt(process.env.MAX_VIOLATIONS_BEFORE_BLOCK || '3', 10);
const BLOCK_FIRST = parseInt(process.env.BLOCK_DURATION_FIRST || '300', 10);
const BLOCK_SECOND = parseInt(process.env.BLOCK_DURATION_SECOND || '900', 10);

// ─── Helper: get reliable client IP ──────────────────────────────────────────
function getClientIp(req: Request): string {
  return (req.ip && req.ip.trim()) ? req.ip.trim() : (req.socket as any)?.remoteAddress || '::1';
}

interface SlidingWindowResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Sliding Window Algorithm using Redis Sorted Sets
 */
async function slidingWindowCheck(key: string, limit: number, windowMs: number): Promise<SlidingWindowResult> {
  const now = Date.now();
  const windowStart = now - windowMs;
  const resetTime = Math.ceil((now + windowMs) / 1000);

  const pipeline = redisClient.pipeline();
  pipeline.zremrangebyscore(key, '-inf', windowStart); // [0] expire entries hatao
  pipeline.zadd(key, now, `${now}-${Math.random()}`); // [1] current request add karo PEHLE
  pipeline.zcard(key);                                 // [2] ab accurate total count lo
  pipeline.pexpire(key, windowMs);                     // [3] TTL refresh karo

  const results = await pipeline.exec();
  const count = (results?.[2]?.[1] as number) || 0;   // index 2 = zcard result

  const remaining = Math.max(0, limit - count);

  if (count > limit) {
    // Limit exceed hua — abhi jo request add ki woh wapas hatao
    await redisClient.zremrangebyscore(key, now, now);

    const violationKey = `violations:${key}`;
    const violations = await redisClient.incr(violationKey);
    await redisClient.expire(violationKey, Math.ceil(windowMs / 1000) * 2);

    if (violations >= MAX_VIOLATIONS) {
      const blockCountKey = `blockcount:${key}`;
      const blockCount = await redisClient.incr(blockCountKey);
      await redisClient.expire(blockCountKey, 86400);

      const blockDuration = blockCount > 1 ? BLOCK_SECOND : BLOCK_FIRST;
      const blockKey = `blocked:${key}`;
      await redisClient.set(blockKey, '1', 'EX', blockDuration);
      await redisClient.del(violationKey);

      logger.warn(`Progressive block applied: ${key} for ${blockDuration}s`);
    }

    return { allowed: false, limit, remaining: 0, reset: resetTime };
  }

  return { allowed: true, limit, remaining, reset: resetTime };
}

async function isBlocked(key: string): Promise<{ blocked: boolean; retryAfter?: number }> {
  const ttl = await redisClient.ttl(`blocked:${key}`);
  if (ttl > 0) return { blocked: true, retryAfter: ttl };
  return { blocked: false };
}

interface RateLimiterOptions {
  getKey: (req: Request) => string;
  limit: number;
  windowMs?: number;
  limitType?: string;
}

/**
 * Factory: create rate limiter middleware
 */
function createRateLimiter(options: RateLimiterOptions) {
  const { getKey, limit, windowMs = 60000, limitType = 'generic' } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Admin users are always whitelisted — no rate limits apply
    if (req.isWhitelisted || req.user?.role === 'admin') return next();

    const key = getKey(req);

    const setHeaders = (result: SlidingWindowResult) => {
      res.set('X-RateLimit-Limit', String(result.limit));
      res.set('X-RateLimit-Remaining', String(result.remaining));
      res.set('X-RateLimit-Reset', String(result.reset));
    };

    const blockStatus = await isBlocked(key);
    if (blockStatus.blocked) {
      await AuditLog.create({
        userId: req.user?.userId || null,
        ip: req.ip,
        endpoint: req.path,
        method: req.method,
        limitExceededReason: `BLOCKED - ${limitType}`,
        statusCode: 429,
      }).catch(() => { });

      logger.warn(`Blocked request: ${key} on ${req.path}`);

      res.status(429).json({
        error: 'You are temporarily blocked due to repeated violations',
        retryAfter: blockStatus.retryAfter,
      });
      return;
    }

    const result = await slidingWindowCheck(key, limit, windowMs);
    setHeaders(result);

    if (!result.allowed) {
      const retryAfter = result.reset - Math.floor(Date.now() / 1000);
      res.set('Retry-After', String(retryAfter));

      await AuditLog.create({
        userId: req.user?.userId || null,
        ip: req.ip,
        endpoint: req.path,
        method: req.method,
        limitExceededReason: `RATE_LIMIT_EXCEEDED - ${limitType} (${limit} req/${windowMs / 1000}s)`,
        statusCode: 429,
      }).catch(() => { });

      logger.warn(`Rate limit exceeded: ${key} [${limitType}] on ${req.path}`);

      res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter,
      });
      return;
    }

    next();
  };
}

/** Per-IP rate limiter */
export const ipRateLimiter = createRateLimiter({
  getKey: (req) => `ip:${getClientIp(req)}`,
  limit: parseInt(process.env.IP_LIMIT || '200', 10),
  windowMs: 60000,
  limitType: 'per-ip',
});

/** Dynamic per-user limiter (reads role from JWT) */
export const dynamicUserRateLimiter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (!req.user) return next();
  if (req.user.role === 'admin') return next();

  const limit =
    req.user.role === 'paid'
      ? parseInt(process.env.PAID_USER_LIMIT || '1000', 10)
      : parseInt(process.env.FREE_USER_LIMIT || '100', 10);

  return createRateLimiter({
    getKey: () => `user:${req.user!.userId}`,
    limit,
    windowMs: 60000,
    limitType: `per-user-${req.user!.role}`,
  })(req, res, next);
};

/** Endpoint-specific rate limiter factory */
export const endpointLimiter = (limit: number, windowMs = 60000) =>
  createRateLimiter({
    getKey: (req) => `endpoint:${req.method}:${req.path}:${getClientIp(req)}`,
    limit,
    windowMs,
    limitType: `endpoint-${limit}`,
  });

/** IP Blacklist / Whitelist gate — must run first */
export const ipGateMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const clientIp = getClientIp(req);

  const blacklist = (process.env.BLACKLISTED_IPS || '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);

  if (blacklist.includes(clientIp)) {
    logger.warn(`Blacklisted IP blocked: ${clientIp}`);
    await AuditLog.create({
      ip: clientIp,
      endpoint: req.path,
      method: req.method,
      limitExceededReason: 'BLACKLISTED_IP',
      statusCode: 403,
    }).catch(() => { });
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  if (WHITELISTED_IPS.includes(clientIp)) {
    req.isWhitelisted = true;
  }

  next();
};

/** Set isWhitelisted flag for admin users (must run after authenticate) */
const adminWhitelistMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user?.role === 'admin') {
    req.isWhitelisted = true;
  }
  next();
};

/** Audit logger for all responses */
export const auditLogger = (req: Request, res: Response, next: NextFunction): void => {
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    if (!req.path.includes('/login') && !req.path.includes('/register')) {
      AuditLog.create({
        userId: req.user?.userId || null,
        ip: req.ip,
        endpoint: req.path,
        method: req.method,
        statusCode: res.statusCode,
        limitExceededReason: null,
      }).catch(() => { });
    }
    return originalJson(body);
  };
  next();
};

export { redisClient, createRateLimiter, adminWhitelistMiddleware };