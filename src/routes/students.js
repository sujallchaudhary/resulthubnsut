const { Router } = require('express');
const { query, validationResult } = require('express-validator');
const { getAllStudents, getStudentByRollNo } = require('../controllers/studentController');
const { getAcademicTwins } = require('../controllers/twinsController');
const { listLimiter, profileLimiter, twinsLimiter } = require('../middleware/rateLimits');

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
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  ],
  handleValidation,
  getAllStudents
);

router.get(
  '/:rollNo/twins',
  twinsLimiter,
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage('limit must be an integer between 1 and 20'),
  ],
  handleValidation,
  getAcademicTwins
);

router.get('/:rollNo', profileLimiter, getStudentByRollNo);

module.exports = router;
