const rateLimit = require('express-rate-limit');

const makeMessage = (msg) => ({ success: false, data: null, message: msg });

/**
 * Strict limiter for paginated list endpoints (GET /api/students list, GET /api/filter).
 * Scraping these with rapid sequential page requests is the primary abuse vector.
 * 30 requests per 15 minutes per IP.
 */
const listLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: makeMessage('Too many list requests from this IP. Please wait 15 minutes before trying again.'),
});

/**
 * Moderate limiter for individual student profile lookups (GET /api/students/:rollNo).
 * Prevents roll-number enumeration while still allowing normal browsing.
 * 60 requests per 15 minutes per IP.
 */
const profileLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: makeMessage('Too many profile requests from this IP. Please wait 15 minutes before trying again.'),
});

/**
 * Low limiter for the stats endpoint (GET /api/stats).
 * This endpoint returns a single aggregated payload; there is no reason to
 * call it repeatedly.
 * 20 requests per 15 minutes per IP.
 */
const statsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: makeMessage('Too many stats requests from this IP. Please wait 15 minutes before trying again.'),
});

/**
 * Strict limiter for the academic-twins endpoint (GET /api/students/:rollNo/twins).
 * This is a computationally heavy endpoint.
 * 15 requests per 15 minutes per IP.
 */
const twinsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: makeMessage('Too many academic twins requests from this IP. Please wait 15 minutes before trying again.'),
});

module.exports = { listLimiter, profileLimiter, statsLimiter, twinsLimiter };
