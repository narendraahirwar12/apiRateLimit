import mongoose, { Document, Model } from 'mongoose';

export interface IRateLimit extends Document {
  key: string;
  requests: Date[];
  violations: number;
  blockedUntil: Date | null;
  blockCount: number;
  updatedAt: Date;
}

const rateLimitSchema = new mongoose.Schema<IRateLimit>(
  {
    key: { type: String, required: true, unique: true },
    requests: [{ type: Date }],
    violations: { type: Number, default: 0 },
    blockedUntil: { type: Date, default: null },
    blockCount: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now, expires: 3600 },
  }
);

export default mongoose.model<IRateLimit>('RateLimit', rateLimitSchema) as Model<IRateLimit>;
