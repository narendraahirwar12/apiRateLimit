import { Request, Response } from 'express';
import AuditLog from '../models/AuditLog';
import RateLimit from '../models/RateLimit';

export async function getAuditLogs(req: Request, res: Response): Promise<void> {
  try {
    const { limit = 50, page = 1, userId, ip } = req.query;
    const filter: Record<string, any> = {};
    if (userId) filter.userId = userId;
    if (ip) filter.ip = ip;

    const logs = await AuditLog.find(filter)
      .sort({ timestamp: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .populate('userId', 'username email role');

    const total = await AuditLog.countDocuments(filter);
    res.json({ total, page: Number(page), limit: Number(limit), logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function getRateLimits(req: Request, res: Response): Promise<void> {
  try {
    const records = await RateLimit.find().sort({ updatedAt: -1 }).limit(100);
    res.json({ count: records.length, records });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function unblock(req: Request, res: Response): Promise<void> {
  try {
    const key = decodeURIComponent(req.params.key);
    await RateLimit.updateOne(
      { key },
      { $set: { blockedUntil: null, violations: 0 } }
    );
    res.json({ message: `Block removed for key: ${key}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

/** In-memory only; process restart clears. Persist to DB in production. */
export function addToBlacklist(req: Request, res: Response): void {
  const { ip } = req.body;
  if (!ip) {
    res.status(400).json({ error: 'ip is required' });
    return;
  }
  const current = (process.env.BLACKLISTED_IPS || '').split(',').filter(Boolean);
  if (!current.includes(ip)) current.push(ip);
  process.env.BLACKLISTED_IPS = current.join(',');
  res.json({ message: `IP ${ip} blacklisted`, blacklist: current });
}
