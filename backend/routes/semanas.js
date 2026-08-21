const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/semanasController');

router.get('/', auth, c.getAll);
router.post('/', auth, c.create);
router.delete('/:id', auth, c.remove);

module.exports = router;
