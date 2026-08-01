const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/authController');

router.post('/login', c.login);
router.get('/me', auth, c.me);
router.post('/register', auth, c.register);
router.put('/password', auth, c.changePassword);

module.exports = router;
