const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { endpointLimiter, dynamicUserRateLimiter, ipRateLimiter } = require('../middleware/rateLimiter');
const apiController = require('../controllers/apiController');
const adminController = require('../controllers/adminController');

const router = express.Router();

// Order matters: auth first, then IP limit, then per-user limit
router.use(authenticate);
router.use(ipRateLimiter);
router.use(dynamicUserRateLimiter);

// GET /api/reports — limited to 20 req/min per endpoint per IP
router.get(
  '/reports',
  endpointLimiter(parseInt(process.env.REPORTS_ENDPOINT_LIMIT) || 20),
  apiController.getReports
);

// GET /api/profile
router.get('/profile', apiController.getProfile);

// GET /api/data — generic data endpoint
router.get('/data', apiController.getData);

// POST /api/data — create data
router.post('/data', apiController.postData);

// ─── Admin-only routes ───────────────────────────────────────────────────────

// GET /api/admin/audit-logs
router.get('/admin/audit-logs', requireAdmin, adminController.getAuditLogs);

// GET /api/admin/rate-limits
router.get('/admin/rate-limits', requireAdmin, adminController.getRateLimits);

// DELETE /api/admin/block/:key — unblock a user or IP
router.delete('/admin/block/:key', requireAdmin, adminController.unblock);

// POST /api/admin/blacklist — add IP to blacklist at runtime
router.post('/admin/blacklist', requireAdmin, adminController.addToBlacklist);

module.exports = router;
