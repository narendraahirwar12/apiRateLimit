const mongoose = require('mongoose');

// Sliding window rate limit tracker
const rateLimitSchema = new mongoose.Schema({
  key:       { type: String, required: true, unique: true },  // e.g. "user:123", "ip:192.168.1.1"
  requests:  [{ type: Date }],  // timestamps of requests in current window
  violations: { type: Number, default: 0 },
  blockedUntil: { type: Date, default: null },
  blockCount:   { type: Number, default: 0 },  // how many times blocked (for progressive penalty)
  updatedAt: { type: Date, default: Date.now, expires: 3600 },  // auto-clean after 1hr inactivity
});

rateLimitSchema.index({ key: 1 });

module.exports = mongoose.model('RateLimit', rateLimitSchema);
