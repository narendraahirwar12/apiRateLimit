export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: string;
        tenantId: string | null;
        username: string;
      };
      isWhitelisted?: boolean;
    }
  }
}
