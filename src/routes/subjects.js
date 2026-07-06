const { Router } = require('express');
const { param, validationResult } = require('express-validator');
const { getSubjectAnalytics, getSubjectCodes } = require('../controllers/subjectController');

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

router.get('/codes', getSubjectCodes);

router.get(
  '/:code/analytics',
  [param('code').isString().trim().notEmpty().withMessage('code must be a non-empty string')],
  handleValidation,
  getSubjectAnalytics
);

module.exports = router;
