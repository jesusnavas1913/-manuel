const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/planeacionesController');

router.get('/', auth, c.getAll);
router.post('/', auth, c.create);
router.put('/:id', auth, c.update);
router.delete('/:id', auth, c.remove);

module.exports = router;
