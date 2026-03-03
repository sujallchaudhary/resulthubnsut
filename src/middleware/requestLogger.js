const RequestLog = require('../models/RequestLog');

const requestLogger = (req, res, next) => {
  res.on('finish', () => {
    RequestLog.create({
      path: req.path,
      query: req.query || {},
      params: req.params || {},
      statusCode: res.statusCode,
    }).catch(() => {});
  });

  next();
};

module.exports = requestLogger;
