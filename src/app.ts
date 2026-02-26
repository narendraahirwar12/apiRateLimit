import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import connectDB from './config/database';
import { ipGateMiddleware, auditLogger } from './middleware/rateLimiter';
import authRoutes from './routes/auth';
import apiRoutes from './routes/api';
import logger from './utils/logger';

const app = express();

connectDB();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);

app.use(ipGateMiddleware);
app.use(auditLogger);

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date(), service: 'API Rate Limiter' });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'API Rate Limiting & Abuse Prevention System',
    version: '1.0.0',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login  [10 req/min]',
      },
      protected: {
        profile: 'GET /api/profile',
        reports: 'GET /api/reports      [20 req/min]',
        data: 'GET /api/data',
        dataPost: 'POST /api/data',
      },
      admin: {
        auditLogs: 'GET /api/admin/audit-logs',
        rateLimits: 'GET /api/admin/rate-limits',
        unblock: 'DELETE /api/admin/block/:key',
        blacklistIP: 'POST /api/admin/blacklist',
      },
    },
    rateLimits: {
      freeUser: `${process.env.FREE_USER_LIMIT || 100} req/min`,
      paidUser: `${process.env.PAID_USER_LIMIT || 1000} req/min`,
      admin: 'Unlimited',
      perIP: `${process.env.IP_LIMIT || 200} req/min`,
      login: `${process.env.LOGIN_ENDPOINT_LIMIT || 10} req/min`,
      reports: `${process.env.REPORTS_ENDPOINT_LIMIT || 20} req/min`,
    },
  });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${PORT}`);
  logger.info(`📋 Rate limiting algorithm: Sliding Window`);
  logger.info(`🔐 JWT Authentication enabled`);
  logger.info(`🛡️  Abuse prevention: Progressive blocking enabled`);
});

export default app;
