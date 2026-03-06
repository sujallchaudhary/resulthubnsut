const requestLogger = (req, res, next) => {
  res.on('finish', () => {
    // Derive feature from path: /api/<college>/<feature>/... or /health
    const segments = req.path.split('/').filter(Boolean);
    // With college prefix: /api/<college>/<feature>/...
    const feature = segments[0] === 'api' ? (segments[2] || null) : (segments[0] || null);

    // Only log if we have a college-scoped RequestLog model
    const RequestLog = req.models?.RequestLog;
    if (!RequestLog) return;

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
