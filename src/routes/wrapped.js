const { Router } = require('express');
const { param, validationResult } = require('express-validator');
const { getWrapped } = require('../controllers/wrappedController');

const router = Router();

/** Extract rollNo and semester from wildcard path (e.g. 24/CS/108/3 → rollNo=24/CS/108, semester=3). */
function extractWrappedParams(req, _res, next) {
  const wild = req.params.wildcard;
  const parts = Array.isArray(wild) ? wild : wild.split('/');
  // Last segment is the semester, everything before is the rollNo
  req.params.semester = parts.pop() || '';
  req.params.rollNo = parts.join('/');
  next();
}

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      data: null,
      message: 'Validation error',
      errors: errors.array(),
    });
  }
  next();
};

router.get(
  '/{*wildcard}',
  extractWrappedParams,
  [
    param('rollNo').isString().trim().notEmpty().withMessage('rollNo is required'),
    param('semester').isInt({ min: 1 }).withMessage('semester must be a positive integer'),
  ],
  handleValidation,
  getWrapped,
);

module.exports = router;
