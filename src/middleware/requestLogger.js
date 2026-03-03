const RequestLog = require('../models/RequestLog');

const requestLogger = (req, res, next) => {
  res.on('finish', () => {
    // Derive feature from path: /api/<feature>/... or /health
    const segments = req.path.split('/').filter(Boolean);
    const feature = segments[0] === 'api' ? (segments[1] || null) : (segments[0] || null);

    RequestLog.create({
      path: req.path,
      feature,
      query: req.query || {},
      params: req.params || {},
      statusCode: res.statusCode,
    }).catch(() => {});
  });

  next();
};

module.exports = requestLogger;
