const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  ip:       { type: String, required: true },
  endpoint: { type: String, required: true },
  method:   { type: String, required: true },
  limitExceededReason: { type: String, default: null },
  statusCode: { type: Number, default: 200 },
  timestamp:  { type: Date, default: Date.now },
}, { timestamps: false });

// Auto-expire logs after 30 days
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
