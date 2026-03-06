const { Router } = require('express');
const { query, validationResult } = require('express-validator');
const { getSubjectDifficulty } = require('../controllers/subjectController');

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
  '/difficulty',
  [
    query('semester').optional().isInt({ min: 1 }).withMessage('semester must be a positive integer'),
    query('branch').optional().isString().trim().notEmpty().withMessage('branch must be a non-empty string'),
    query('rollNo').optional().isString().trim().notEmpty().withMessage('rollNo must be a non-empty string'),
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  ],
  handleValidation,
  getSubjectDifficulty
);

module.exports = router;
