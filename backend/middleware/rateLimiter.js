// Rate Limiter simple y robusto basado en ventana deslizante en memoria
const memoryStore = new Map();

function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutos por defecto
  const max = options.max || 500; // Permisivo para desarrollo y producción fluida
  const message = options.message || 'Demasiadas peticiones desde esta IP. Por favor intente más tarde.';

  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of memoryStore.entries()) {
      if (now > record.resetTime) {
        memoryStore.delete(ip);
      }
    }
  }, windowMs);

  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'ip-desconocida';
    const key = `${req.baseUrl}_${ip}`;
    const now = Date.now();

    let record = memoryStore.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs
      };
      memoryStore.set(key, record);
    } else {
      record.count++;
    }

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      return res.status(429).json({ error: message });
    }

    next();
  };
}

// Rate Limiter flexible para Login
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Demasiados intentos de inicio de sesión. Intente en unos minutos.'
});

// Rate Limiter general para la API REST
const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Límite de velocidad excedido para la API.'
});

module.exports = {
  createRateLimiter,
  loginLimiter,
  apiLimiter
};
