require('dotenv').config();
const express = require('express');
const connectDB = require('./config/database');
const { ipGateMiddleware, auditLogger } = require('./middleware/rateLimiter');
const authRoutes = require('./routes/auth');
const apiRoutes  = require('./routes/api');
const logger = require('./utils/logger');

const app = express();

// ─── Connect to MongoDB ──────────────────────────────────────────────────────
connectDB();

// ─── Global Middleware ───────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy (important for getting real IP behind nginx/load balancer)
app.set('trust proxy', 1);

// IP Blacklist/Whitelist gate (runs first)
app.use(ipGateMiddleware);

// Audit logger
app.use(auditLogger);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api',      apiRoutes);

// Health check (no rate limit)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date(), service: 'API Rate Limiter' });
});

// Root
app.get('/', (req, res) => {
  res.json({
    message: 'API Rate Limiting & Abuse Prevention System',
    version: '1.0.0',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login:    'POST /api/auth/login  [10 req/min]',
      },
      protected: {
        profile:  'GET /api/profile',
        reports:  'GET /api/reports      [20 req/min]',
        data:     'GET /api/data',
        dataPost: 'POST /api/data',
      },
      admin: {
        auditLogs:   'GET /api/admin/audit-logs',
        rateLimits:  'GET /api/admin/rate-limits',
        unblock:     'DELETE /api/admin/block/:key',
        blacklistIP: 'POST /api/admin/blacklist',
      },
    },
    rateLimits: {
      freeUser:  `${process.env.FREE_USER_LIMIT || 100} req/min`,
      paidUser:  `${process.env.PAID_USER_LIMIT || 1000} req/min`,
      admin:     'Unlimited',
      perIP:     `${process.env.IP_LIMIT || 200} req/min`,
      login:     `${process.env.LOGIN_ENDPOINT_LIMIT || 10} req/min`,
      reports:   `${process.env.REPORTS_ENDPOINT_LIMIT || 20} req/min`,
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${PORT}`);
  logger.info(`📋 Rate limiting algorithm: Sliding Window`);
  logger.info(`🔐 JWT Authentication enabled`);
  logger.info(`🛡️  Abuse prevention: Progressive blocking enabled`);
});

module.exports = app;
