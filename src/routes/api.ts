import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { endpointLimiter, dynamicUserRateLimiter, ipRateLimiter } from '../middleware/rateLimiter';
import * as apiController from '../controllers/apiController';
import * as adminController from '../controllers/adminController';

const router = Router();

// Order matters: auth first, then IP limit, then per-user limit
router.use(authenticate);
router.use(ipRateLimiter);
router.use(dynamicUserRateLimiter);

router.get(
  '/reports',
  endpointLimiter(parseInt(process.env.REPORTS_ENDPOINT_LIMIT || '20', 10)),
  apiController.getReports
);

router.get('/profile', apiController.getProfile);
router.get('/data', apiController.getData);
router.post('/data', apiController.postData);

// ─── Admin-only routes ───────────────────────────────────────────────────────
router.get('/admin/audit-logs', requireAdmin, adminController.getAuditLogs);
router.get('/admin/rate-limits', requireAdmin, adminController.getRateLimits);
router.delete('/admin/block/:key', requireAdmin, adminController.unblock);
router.post('/admin/blacklist', requireAdmin, adminController.addToBlacklist);

export default router;
