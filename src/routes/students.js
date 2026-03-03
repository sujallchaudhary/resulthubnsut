const { Router } = require('express');
const { query, validationResult } = require('express-validator');
const { getAllStudents, getStudentByRollNo } = require('../controllers/studentController');

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
  [
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100'),
  ],
  handleValidation,
  getAllStudents
);

router.get('/:rollNo', getStudentByRollNo);

module.exports = router;
