const redis = require('ioredis');
const auditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

// ─── Redis Client ─────────────────────────────────────────────────────────────
const redisClient = new redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

redisClient.on('connect', () => logger.info('✅ Redis connected'));
redisClient.on('error', (err) => logger.error(`Redis error: ${err.message}`));

// ─── Constants ────────────────────────────────────────────────────────────────
const WHITELISTED_IPS = (process.env.WHITELISTED_IPS || '').split(',').map(ip => ip.trim()).filter(Boolean);

const MAX_VIOLATIONS = parseInt(process.env.MAX_VIOLATIONS_BEFORE_BLOCK) || 3;
const BLOCK_FIRST = parseInt(process.env.BLOCK_DURATION_FIRST) || 300;   // 5 min
const BLOCK_SECOND = parseInt(process.env.BLOCK_DURATION_SECOND) || 900; // 15 min

/**
 * Sliding Window Algorithm using Redis Sorted Sets
 * FIX: zadd PEHLE, phir zcard — taaki count mein current request bhi include ho
 */
async function slidingWindowCheck(key, limit, windowMs) {
  const now = Date.now();
  const windowStart = now - windowMs;
  const resetTime = Math.ceil((now + windowMs) / 1000);

  const pipeline = redisClient.pipeline();
  pipeline.zremrangebyscore(key, '-inf', windowStart); // [0] expire entries hatao
  pipeline.zadd(key, now, `${now}-${Math.random()}`); // [1] current request PEHLE add karo
  pipeline.zcard(key);                                 // [2] ab accurate total count lo
  pipeline.pexpire(key, windowMs);                     // [3] TTL refresh karo

  const results = await pipeline.exec();
  const count = results?.[2]?.[1] || 0; // index 2 = zcard result

  const remaining = Math.max(0, limit - count);

  if (count > limit) {
    // Limit exceed hua — abhi jo request add ki woh wapas hatao
    await redisClient.zremrangebyscore(key, now, now);

    // Violation tracking
    const violationKey = `violations:${key}`;
    const violations = await redisClient.incr(violationKey);
    await redisClient.expire(violationKey, Math.ceil(windowMs / 1000) * 2);

    if (violations >= MAX_VIOLATIONS) {
      const blockCountKey = `blockcount:${key}`;
      const blockCount = await redisClient.incr(blockCountKey);
      await redisClient.expire(blockCountKey, 86400); // 24h

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

/**
 * Check if a key is currently blocked
 */
async function isBlocked(key) {
  const ttl = await redisClient.ttl(`blocked:${key}`);
  if (ttl > 0) return { blocked: true, retryAfter: ttl };
  return { blocked: false };
}

/**
 * Factory: create rate limiter middleware
 * FIX: Admin users bypass all rate limits
 */
function createRateLimiter({ getKey, limit, windowMs = 60000, limitType = 'generic' }) {
  return async (req, res, next) => {
    // Admin users aur whitelisted IPs — koi rate limit nahi
    if (req.isWhitelisted || req.user?.role === 'admin') return next();

    const key = getKey(req);

    const setHeaders = (result) => {
      res.set('X-RateLimit-Limit', result.limit);
      res.set('X-RateLimit-Remaining', result.remaining);
      res.set('X-RateLimit-Reset', result.reset);
    };

    const blockStatus = await isBlocked(key);
    if (blockStatus.blocked) {
      await auditLog.create({
        userId: req.user?.userId || null,
        ip: req.ip,
        endpoint: req.path,
        method: req.method,
        limitExceededReason: `BLOCKED - ${limitType}`,
        statusCode: 429,
      }).catch(() => { });

      logger.warn(`Blocked request: ${key} on ${req.path}`);

      return res.status(429).json({
        error: 'You are temporarily blocked due to repeated violations',
        retryAfter: blockStatus.retryAfter,
      });
    }

    const result = await slidingWindowCheck(key, limit, windowMs);
    setHeaders(result);

    if (!result.allowed) {
      const retryAfter = result.reset - Math.floor(Date.now() / 1000);
      res.set('Retry-After', retryAfter);

      await auditLog.create({
        userId: req.user?.userId || null,
        ip: req.ip,
        endpoint: req.path,
        method: req.method,
        limitExceededReason: `RATE_LIMIT_EXCEEDED - ${limitType} (${limit} req/${windowMs / 1000}s)`,
        statusCode: 429,
      }).catch(() => { });

      logger.warn(`Rate limit exceeded: ${key} [${limitType}] on ${req.path}`);

      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter,
      });
    }

    next();
  };
}

// ─── Pre-built rate limiters ──────────────────────────────────────────────────

/** Per-IP rate limiter */
const ipRateLimiter = createRateLimiter({
  getKey: (req) => `ip:${req.ip}`,
  limit: parseInt(process.env.IP_LIMIT) || 200,
  windowMs: 60000,
  limitType: 'per-ip',
});

/** Dynamic per-user limiter (reads role from JWT) */
const dynamicUserRateLimiter = async (req, res, next) => {
  if (!req.user) return next();
  if (req.user.role === 'admin') return next(); // admin = unlimited

  const limit = req.user.role === 'paid'
    ? parseInt(process.env.PAID_USER_LIMIT) || 1000
    : parseInt(process.env.FREE_USER_LIMIT) || 100;

  return createRateLimiter({
    getKey: () => `user:${req.user.userId}`,
    limit,
    windowMs: 60000,
    limitType: `per-user-${req.user.role}`,
  })(req, res, next);
};

/** Endpoint-specific rate limiter factory */
const endpointLimiter = (limit, windowMs = 60000) =>
  createRateLimiter({
    getKey: (req) => `endpoint:${req.method}:${req.path}:${req.ip}`,
    limit,
    windowMs,
    limitType: `endpoint-${limit}`,
  });

/** IP Blacklist / Whitelist gate — must run first */
const ipGateMiddleware = async (req, res, next) => {
  const clientIp = req.ip;

  const blacklist = (process.env.BLACKLISTED_IPS || '').split(',').map(s => s.trim()).filter(Boolean);

  if (blacklist.includes(clientIp)) {
    logger.warn(`Blacklisted IP blocked: ${clientIp}`);
    await auditLog.create({
      ip: clientIp,
      endpoint: req.path,
      method: req.method,
      limitExceededReason: 'BLACKLISTED_IP',
      statusCode: 403,
    }).catch(() => { });
    return res.status(403).json({ error: 'Access denied' });
  }

  if (WHITELISTED_IPS.includes(clientIp)) {
    req.isWhitelisted = true;
  }

  next();
};

/** Admin whitelist middleware — authenticate ke baad run karo */
const adminWhitelistMiddleware = (req, res, next) => {
  if (req.user?.role === 'admin') {
    req.isWhitelisted = true;
  }
  next();
};

/** Audit logger for all responses */
const auditLogger = async (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = async (body) => {
    if (!req.path.includes('/login') && !req.path.includes('/register')) {
      await auditLog.create({
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

module.exports = {
  redisClient,
  ipGateMiddleware,
  ipRateLimiter,
  dynamicUserRateLimiter,
  endpointLimiter,
  auditLogger,
  createRateLimiter,
  adminWhitelistMiddleware,
};