const { Router } = require('express');
const { getStats } = require('../controllers/statsController');
const { statsLimiter } = require('../middleware/rateLimits');

const router = Router();

router.get('/', statsLimiter, getStats);

module.exports = router;
