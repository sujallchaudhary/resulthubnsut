const { getConnection, getActiveColleges } = require('../db');
const { getModels } = require('../models');

/**
 * Express middleware that reads :college from the URL, validates it,
 * and attaches `req.college` (string) and `req.models` (compiled Mongoose
 * models bound to that college's DB connection) to the request.
 */
function collegeContext(req, res, next) {
  const college = (req.params.college || '').toLowerCase();

  const active = getActiveColleges();
  if (!active.includes(college)) {
    return res.status(400).json({
      success: false,
      data: null,
      message: `Invalid college '${college}'. Available: ${active.join(', ')}`,
    });
  }

  const conn = getConnection(college);
  if (!conn) {
    return res.status(503).json({
      success: false,
      data: null,
      message: `Database for '${college}' is not available`,
    });
  }

  req.college = college;
  req.models = getModels(conn, college);
  next();
}

module.exports = collegeContext;
