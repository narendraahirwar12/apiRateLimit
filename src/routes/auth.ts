import { Router } from 'express';
import { endpointLimiter } from '../middleware/rateLimiter';
import * as authController from '../controllers/authController';

const router = Router();

router.post('/register', authController.register);

router.post(
  '/login',
  endpointLimiter(parseInt(process.env.LOGIN_ENDPOINT_LIMIT || '10', 10)),
  authController.login
);

export default router;
