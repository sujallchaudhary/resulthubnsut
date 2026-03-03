const { Router } = require('express');
const { param, validationResult } = require('express-validator');
const { getWrapped } = require('../controllers/wrappedController');
const { profileLimiter } = require('../middleware/rateLimits');

const router = Router();

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
  '/:rollNo/:semester',
  profileLimiter,
  [
    param('rollNo').isString().trim().notEmpty().withMessage('rollNo is required'),
    param('semester').isInt({ min: 1 }).withMessage('semester must be a positive integer'),
  ],
  handleValidation,
  getWrapped,
);

module.exports = router;
