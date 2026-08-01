const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/reportesController');

router.get('/', auth, c.getReporte);
router.get('/kpi', auth, c.getKPI);

module.exports = router;
