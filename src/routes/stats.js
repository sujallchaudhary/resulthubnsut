const { Router } = require('express');
const { getStats, getBattle, resetStats } = require('../controllers/statsController');
const { statsLimiter } = require('../middleware/rateLimits');

const router = Router();

router.get('/', statsLimiter, getStats);
router.get('/battle', statsLimiter, getBattle);
router.post('/reset', statsLimiter, resetStats);

module.exports = router;
