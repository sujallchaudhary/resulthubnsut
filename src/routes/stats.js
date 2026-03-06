const { Router } = require('express');
const { getStats, getBattle, resetStats } = require('../controllers/statsController');

const router = Router();

router.get('/', getStats);
router.get('/battle', getBattle);
router.post('/reset', resetStats);

module.exports = router;
