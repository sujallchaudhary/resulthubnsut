const rateLimit = require('express-rate-limit');

const rateLimitResponse = (_req, res) => {
  res.status(429).json({
    success: false,
    data: null,
    message: 'Too many requests. Please try again later.',
  });
};

const listLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
});

const profileLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
});

const statsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
});

const twinsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitResponse,
});

module.exports = { listLimiter, profileLimiter, statsLimiter, twinsLimiter };
