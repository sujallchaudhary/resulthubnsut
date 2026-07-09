const { Router } = require('express');
const { query, validationResult } = require('express-validator');
const { getAllStudents, getStudentByRollNo, recordProfileView } = require('../controllers/studentController');
const { getAcademicTwins } = require('../controllers/twinsController');

const router = Router();

/** Extract rollNo from wildcard param (supports slashes like 24/CS/108). */
function extractRollNo(req, _res, next) {
  const wild = req.params.wildcard;
  req.params.rollNo = Array.isArray(wild) ? wild.join('/') : wild;
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
  '/',
  [
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  ],
  handleValidation,
  getAllStudents
);

router.get(
  '/{*wildcard}/twins',
  extractRollNo,
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage('limit must be an integer between 1 and 20'),
  ],
  handleValidation,
  getAcademicTwins
);

router.post('/{*wildcard}/view', extractRollNo, recordProfileView);

router.get('/{*wildcard}', extractRollNo, getStudentByRollNo);

module.exports = router;
