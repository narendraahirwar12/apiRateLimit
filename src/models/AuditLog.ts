import mongoose, { Document, Model } from 'mongoose';

export interface IAuditLog extends Document {
  userId: mongoose.Types.ObjectId | null;
  ip: string;
  endpoint: string;
  method: string;
  limitExceededReason: string | null;
  statusCode: number;
  timestamp: Date;
}

const auditLogSchema = new mongoose.Schema<IAuditLog>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    ip: { type: String, required: true },
    endpoint: { type: String, required: true },
    method: { type: String, required: true },
    limitExceededReason: { type: String, default: null },
    statusCode: { type: Number, default: 200 },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

export default mongoose.model<IAuditLog>('AuditLog', auditLogSchema) as Model<IAuditLog>;
