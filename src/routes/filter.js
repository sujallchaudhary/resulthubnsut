const { Router } = require('express');
const { query, validationResult } = require('express-validator');
const { filterStudents } = require('../controllers/filterController');
const { listLimiter } = require('../middleware/rateLimits');

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
  '/',
  listLimiter,
  [
    query('year').optional().isString().trim().notEmpty().withMessage('year must be a non-empty string'),
    query('branch').optional().isString().trim().notEmpty().withMessage('branch must be a non-empty string'),
    query('query').optional().isString().trim().notEmpty().withMessage('query must be a non-empty string'),
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  ],
  handleValidation,
  filterStudents
);

module.exports = router;
