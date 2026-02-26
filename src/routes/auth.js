const express = require('express');
const { endpointLimiter } = require('../middleware/rateLimiter');
const authController = require('../controllers/authController');

const router = express.Router();

// POST /api/auth/register
router.post('/register', authController.register);

// POST /api/auth/login — limited to 10 req/min per IP
router.post(
  '/login',
  endpointLimiter(parseInt(process.env.LOGIN_ENDPOINT_LIMIT) || 10),
  authController.login
);

module.exports = router;
