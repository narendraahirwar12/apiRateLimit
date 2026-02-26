const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId).select('-password');
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = {
      userId: user._id.toString(),
      role: user.role,
      tenantId: user.tenantId,
      username: user.username,
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Optional auth - attaches user if token present, doesn't fail if not
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      if (user && user.isActive) {
        req.user = {
          userId: user._id.toString(),
          role: user.role,
          tenantId: user.tenantId,
          username: user.username,
        };
      }
    }
  } catch (_) { }
  next();
};

module.exports = { authenticate, optionalAuth };
