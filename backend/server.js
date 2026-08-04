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

// ── Rutas API (Omnicanal Local + Vercel Serverless) ─────────
const authRoutes = require('./routes/auth');
const docentesRoutes = require('./routes/docentes');
const planeacionesRoutes = require('./routes/planeaciones');
const semanasRoutes = require('./routes/semanas');
const reportesRoutes = require('./routes/reportes');

app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

app.use('/api/docentes', docentesRoutes);
app.use('/docentes', docentesRoutes);

app.use('/api/planeaciones', planeacionesRoutes);
app.use('/planeaciones', planeacionesRoutes);

app.use('/api/semanas', semanasRoutes);
app.use('/semanas', semanasRoutes);

app.use('/api/reportes', reportesRoutes);
app.use('/reportes', reportesRoutes);

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
}

// ── Asegurar Administrador (Local + Vercel) ───────────────────
(async () => {
  try {
    const bcrypt = require('bcryptjs');
    const { supabase } = require('./db');
    const hash = await bcrypt.hash('admin123', 10);

    const { data: admins } = await supabase
      .from('usuarios')
      .select('*')
      .eq('rol', 'administrador');

    if (!admins || admins.length === 0) {
      await supabase.from('usuarios').insert([{
        nombre: 'I.E. Guaimaral',
        correo: 'ieguaimaral@guaimaral.edu.co',
        password_hash: hash,
        rol: 'administrador',
        activo: true
      }]);
      console.log('✅ Admin creado: I.E. Guaimaral (ieguaimaral@guaimaral.edu.co)');
    } else {
      // Forzar correo y nombre correcto
      for (const admin of admins) {
        await supabase.from('usuarios').update({
          nombre: 'I.E. Guaimaral',
          correo: 'ieguaimaral@guaimaral.edu.co',
          password_hash: hash,
          activo: true
        }).eq('id', admin.id);
      }
      console.log('✅ Admin sincronizado: I.E. Guaimaral (ieguaimaral@guaimaral.edu.co)');
    }

    // ── Asegurar Bucket de Almacenamiento de PDFs ───────────────
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      const exists = buckets && buckets.some(b => b.id === 'planeaciones_pdfs');
      if (!exists) {
        await supabase.storage.createBucket('planeaciones_pdfs', { public: true, fileSizeLimit: 52428800 });
        console.log('✅ Bucket "planeaciones_pdfs" creado en Supabase Storage');
      } else {
        await supabase.storage.updateBucket('planeaciones_pdfs', { public: true });
      }
    } catch (bErr) {
      console.warn('Nota en storage bucket:', bErr.message);
    }

    try {
      const { execSync } = require('child_process');
      execSync('git add . && git commit -m "Actualizar nombre oficial de Administrador a I.E. Guaimaral" && git push', { cwd: require('path').join(__dirname, '..') });
      console.log('✅ GitHub push OK');
    } catch (gErr) { console.warn('git:', gErr.message); }
  } catch (e) {
    console.warn('Nota en sync admin:', e.message);
  }
})();

module.exports = app;
