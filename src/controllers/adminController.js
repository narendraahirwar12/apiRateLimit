const AuditLog = require('../models/AuditLog');
const RateLimit = require('../models/RateLimit');

async function getAuditLogs(req, res) {
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
}

async function getRateLimits(req, res) {
  try {
    const records = await RateLimit.find().sort({ updatedAt: -1 }).limit(100);
    res.json({ count: records.length, records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function unblock(req, res) {
  try {
    const key = decodeURIComponent(req.params.key);
    await RateLimit.updateOne(
      { key },
      { $set: { blockedUntil: null, violations: 0 } }
    );
    res.json({ message: `Block removed for key: ${key}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function addToBlacklist(req, res) {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'ip is required' });
  const current = (process.env.BLACKLISTED_IPS || '').split(',').filter(Boolean);
  if (!current.includes(ip)) current.push(ip);
  process.env.BLACKLISTED_IPS = current.join(',');
  res.json({ message: `IP ${ip} blacklisted`, blacklist: current });
}

module.exports = {
  getAuditLogs,
  getRateLimits,
  unblock,
  addToBlacklist,
};
