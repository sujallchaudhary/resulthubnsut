// Rate limiting is currently disabled. Replace the passthrough with real
// limiters when you want to re-enable.
const passthrough = (_req, _res, next) => next();

const listLimiter = passthrough;
const profileLimiter = passthrough;
const statsLimiter = passthrough;
const twinsLimiter = passthrough;

module.exports = { listLimiter, profileLimiter, statsLimiter, twinsLimiter };
