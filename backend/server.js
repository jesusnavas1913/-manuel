require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// ── Middlewares globales ──────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
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

// ── Arrancar ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 SIGEP-IEG API corriendo en puerto ${PORT}`);
});
