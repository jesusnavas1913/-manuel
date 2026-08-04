if (!process.env.VERCEL) require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const securityHeaders = require('./middleware/security');
const { apiLimiter } = require('./middleware/rateLimiter');

const app = express();

// ── Seguridad de Cabeceras HTTP ──────────────────────────────
app.use(securityHeaders);

// ── CORS Configuración Ultra Permisiva para Dev ───────────────
app.use(cors({
  origin: (origin, callback) => {
    // Permitir cualquier origen en entorno de desarrollo local o sin origin (cURL, Postman, file://)
    if (!origin || !process.env.VERCEL) return callback(null, true);
    
    const ALLOWED_ORIGINS = [
      'https://manuel-red.vercel.app',
      'https://manuel.vercel.app',
      /\.vercel\.app$/
    ];
    const allowed = ALLOWED_ORIGINS.some(o => typeof o === 'string' ? o === origin : o.test(origin));
    return callback(null, allowed ? true : true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.options('*', cors());

// Limitar tamaño de carga de payloads JSON para evitar DoS
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Rate Limiter General para Rutas API ───────────────────────
app.use('/api/', apiLimiter);

// ── Rutas API ────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/docentes', require('./routes/docentes'));
app.use('/api/planeaciones', require('./routes/planeaciones'));
app.use('/api/semanas', require('./routes/semanas'));
app.use('/api/reportes', require('./routes/reportes'));

// ── Servir archivos estáticos del Frontend ─────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// ── Health check ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 Genérico ─────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ── Error Handler Global Centralizado ────────────────────────
app.use((err, req, res, next) => {
  console.error('💥 Error global no capturado:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message || 'Error interno del servidor'
  });
});

// ── Arrancar Servidor (Local) ─────────────────────────────────
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`🚀 SIGEP-IEG API corriendo en puerto ${PORT}`);
  });
  
  const cronJobs = require('./cron/verificador');
  cronJobs.iniciarCronJobs();

  // Asegurar usuario administrador por defecto
  (async () => {
    try {
      const bcrypt = require('bcryptjs');
      const { supabase } = require('./db');
      const { data: admins } = await supabase.from('usuarios').select('*').eq('rol', 'administrador');
      if (!admins || admins.length === 0) {
        const hash = await bcrypt.hash('admin123', 10);
        await supabase.from('usuarios').insert([{
          nombre: 'Pedro Administrador',
          correo: 'ieguaimaral@guaimaral.edu.co',
          password_hash: hash,
          rol: 'administrador',
          activo: true
        }]);
        console.log('✅ Administrador configurado: Pedro Administrador (ieguaimaral@guaimaral.edu.co)');
      } else {
        for (const admin of admins) {
          await supabase.from('usuarios').update({
            nombre: 'Pedro Administrador',
            correo: 'ieguaimaral@guaimaral.edu.co'
          }).eq('id', admin.id);
        }
        console.log('✅ Administrador actualizado: Pedro Administrador (ieguaimaral@guaimaral.edu.co)');
      }
    } catch (e) {
      console.warn('Nota en sync admin:', e.message);
    }
  })();
}

module.exports = app;
