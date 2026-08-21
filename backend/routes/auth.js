const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/authController');
const { loginLimiter } = require('../middleware/rateLimiter');

// Login con protección estricta contra ataques de fuerza bruta
router.post('/login', loginLimiter, c.login);

router.get('/me', auth, c.me);
router.post('/register', auth, c.register);
router.put('/password', auth, c.changePassword);
router.post('/impersonate', auth, c.impersonate);

module.exports = router;

