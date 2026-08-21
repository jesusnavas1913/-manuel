// Middleware de seguridad de cabeceras HTTP (Hardening de Servidor)
module.exports = (req, res, next) => {
  // Previene que la página sea embebida en iFrames maliciosos (Anti-Clickjacking)
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Previene que el navegador adivine tipos MIME (MIME-Sniffing)
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Habilita filtro XSS en navegadores legados
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Ocultar cabecera Servidor Express por privacidad
  res.removeHeader('X-Powered-By');

  // Referrer Policy estricto
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  next();
};
