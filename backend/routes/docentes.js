const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/docentesController');

router.get('/sedes', auth, c.getSedes);
router.get('/jornadas', auth, c.getJornadas);
router.get('/', auth, c.getAll);
router.get('/:id', auth, c.getOne);
router.post('/', auth, c.create);
router.put('/:id', auth, c.update);
router.delete('/:id', auth, c.remove);

module.exports = router;
