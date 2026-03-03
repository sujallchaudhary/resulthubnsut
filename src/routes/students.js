const { Router } = require('express');
const { query, validationResult } = require('express-validator');
const { getAllStudents, getStudentByRollNo } = require('../controllers/studentController');
const { listLimiter, profileLimiter } = require('../middleware/rateLimits');

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

router.get('/:rollNo', profileLimiter, getStudentByRollNo);

module.exports = router;
