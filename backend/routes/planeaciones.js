const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/planeacionesController');
const { body } = require('express-validator');
const { validateResult } = require('../middleware/validator');
const multer = require('multer');

// Usamos memoryStorage porque subiremos el buffer directamente a Supabase
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', auth, c.getAll);

router.post('/', auth, upload.single('archivo'), [
  body('area').notEmpty().withMessage('Área es requerida'),
  body('grado').notEmpty().withMessage('Grado es requerido'),
  validateResult
], c.create);

// Ruta especial para que el docente reemplace su propio PDF (con contraseña)
router.post('/:id/reemplazar', auth, upload.single('archivo'), c.reemplazar);

router.get('/:id/descargar', c.download);

router.put('/:id', auth, c.update);
router.delete('/:id', auth, c.remove);

module.exports = router;
