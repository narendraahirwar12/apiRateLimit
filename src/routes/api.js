const express = require('express');
const { authenticate } = require('../middleware/auth');
const { endpointLimiter, dynamicUserRateLimiter, ipRateLimiter } = require('../middleware/rateLimiter');
const AuditLog = require('../models/AuditLog');


const router = express.Router();

// All protected routes require auth + user rate limit
router.use(authenticate);
router.use(ipRateLimiter);
router.use(dynamicUserRateLimiter);

// GET /api/reports — limited to 20 req/min per endpoint per IP
router.get(
  '/reports',
  endpointLimiter(parseInt(process.env.REPORTS_ENDPOINT_LIMIT) || 20),
  async (req, res) => {
    res.json({
      message: 'Reports data',
      user: req.user,
      data: [
        { id: 1, title: 'Monthly Sales', date: '2025-01' },
        { id: 2, title: 'Q1 Summary',    date: '2025-Q1' },
        { id: 3, title: 'Annual Review', date: '2024'    },
      ],
    });
  }
);

// GET /api/profile
router.get('/profile', (req, res) => {
  res.json({
    message: 'User profile',
    user: req.user,
  });
});

// GET /api/data — generic data endpoint
router.get('/data', (req, res) => {
  res.json({
    message: 'Protected data',
    timestamp: new Date(),
    user: req.user,
  });
});

// POST /api/data — create data
router.post('/data', (req, res) => {
  res.status(201).json({
    message: 'Data created',
    payload: req.body,
    createdBy: req.user,
  });
});

// ─── Admin-only routes ───────────────────────────────────────────────────────

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// GET /api/admin/audit-logs
router.get('/admin/audit-logs', requireAdmin, async (req, res) => {
  try {
    const { limit = 50, page = 1, userId, ip } = req.query;
    const filter = {};
    if (userId) filter.userId = userId;
    if (ip) filter.ip = ip;

    const logs = await AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .populate('userId', 'username email role');

    const total = await AuditLog.countDocuments(filter);
    res.json({ total, page: Number(page), limit: Number(limit), logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/rate-limits
router.get('/admin/rate-limits', requireAdmin, async (req, res) => {
  try {
    const records = await RateLimit.find().sort({ updatedAt: -1 }).limit(100);
    res.json({ count: records.length, records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/block/:key — unblock a user or IP
router.delete('/admin/block/:key', requireAdmin, async (req, res) => {
  try {
    const key = decodeURIComponent(req.params.key);
    await RateLimit.updateOne({ key }, { $set: { blockedUntil: null, violations: 0 } });
    res.json({ message: `Block removed for key: ${key}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/blacklist — add IP to blacklist at runtime
router.post('/admin/blacklist', requireAdmin, (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'ip is required' });
  // In production this would persist to DB; here we append to env variable
  const current = (process.env.BLACKLISTED_IPS || '').split(',').filter(Boolean);
  if (!current.includes(ip)) current.push(ip);
  process.env.BLACKLISTED_IPS = current.join(',');
  res.json({ message: `IP ${ip} blacklisted`, blacklist: current });
});

module.exports = router;
