require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// ── CORS ─────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://manuel-red.vercel.app',   // Vercel producción
  'https://manuel.vercel.app',
  /\.vercel\.app$/,                  // cualquier preview de Vercel
  'http://localhost:3001',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:5500',
];

app.use(cors({
  origin: (origin, callback) => {
    // Permitir peticiones sin origin (curl, Postman, same-origin)
    if (!origin) return callback(null, true);
    const allowed = ALLOWED_ORIGINS.some(o =>
      typeof o === 'string' ? o === origin : o.test(origin)
    );
    if (allowed) return callback(null, true);
    callback(new Error(`CORS bloqueado para: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Responder preflight OPTIONS inmediatamente
app.options('*', cors());

app.use(express.json());


// ── Rutas ─────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/docentes', require('./routes/docentes'));
app.use('/api/planeaciones', require('./routes/planeaciones'));
app.use('/api/semanas', require('./routes/semanas'));
app.use('/api/reportes', require('./routes/reportes'));

// ── Servir archivos estáticos del Frontend ─────────────────────
const path = require('path');
app.use(express.static(path.join(__dirname, '../frontend')));

// ── Health check (Render / local verification) ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 genérico ─────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ── Error handler global ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ── Arrancar (local) o exportar (Vercel serverless) ──────────
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`🚀 SIGEP-IEG API corriendo en puerto ${PORT}`);
  });
}

module.exports = app;

