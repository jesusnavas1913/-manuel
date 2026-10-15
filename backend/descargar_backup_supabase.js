const fs = require('fs');
const path = require('path');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bulrbsaoxwuibslfhlef.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1bHJic2FveHd1aWJzbGZobGVmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTMzNDAyMSwiZXhwIjoyMTAwOTEwMDIxfQ.MsQ9sTKtvodOT_gY2z3C1UeQQJJu8YqCs9RkRKATOOc';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const desktopDir = path.join(process.env.USERPROFILE || 'C:\\Users\\Janus', 'Desktop', 'BACKUP_SISTEMA_PLANEACIONES');
const dataDir = path.join(desktopDir, 'DATOS_JSON');
const pdfDir = path.join(desktopDir, 'ARCHIVOS_PDF');

[desktopDir, dataDir, pdfDir].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

async function exportarTabla(nombreTabla) {
  console.log(`📦 Descargando datos de la tabla "${nombreTabla}"...`);
  try {
    const { data, error } = await supabase.from(nombreTabla).select('*');
    if (error) {
      console.error(`❌ Error en tabla ${nombreTabla}:`, error.message);
      return [];
    }
    const filePath = path.join(dataDir, `${nombreTabla}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`✅ ${data.length} registros guardados en: ${filePath}`);
    return data;
  } catch (e) {
    console.error(`❌ Fallo crítico en ${nombreTabla}:`, e.message);
    return [];
  }
}

async function descargarPdfs(planeaciones) {
  console.log(`\n📂 Verificando archivos PDF para respaldar (${planeaciones.length} planeaciones)...`);
  let descargados = 0;
  let fallidos = 0;

  for (const plan of planeaciones) {
    if (!plan.nombre_archivo) continue;
    const raw = plan.nombre_archivo.split('/').pop().split('?')[0];
    const safeName = raw.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const dest = path.join(pdfDir, safeName);

    if (fs.existsSync(dest)) {
      continue; // ya descargado
    }

    let downloadUrl = plan.nombre_archivo;
    if (!downloadUrl.startsWith('http')) {
      downloadUrl = `${SUPABASE_URL}/storage/v1/object/public/planeaciones_pdfs/${encodeURIComponent(plan.nombre_archivo)}`;
    }

    try {
      await new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(dest);
        https.get(downloadUrl, (res) => {
          if (res.statusCode !== 200) {
            fileStream.close();
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
            return reject(new Error(`HTTP ${res.statusCode}`));
          }
          res.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close();
            descargados++;
            resolve();
          });
        }).on('error', (err) => {
          if (fs.existsSync(dest)) fs.unlinkSync(dest);
          reject(err);
        });
      });
    } catch (e) {
      fallidos++;
    }
  }

  console.log(`🏁 Proceso de PDFs: ${descargados} descargados exitosamente, ${fallidos} pendientes por restricción de cuota.`);
}

async function ejecutar() {
  console.log('🚀 Iniciando extracción de respaldo desde Supabase...');
  const usuarios = await exportarTabla('usuarios');
  const docentes = await exportarTabla('docentes');
  const semanas = await exportarTabla('semanas_institucionales');
  const planeaciones = await exportarTabla('planeaciones');

  if (planeaciones && planeaciones.length > 0) {
    await descargarPdfs(planeaciones);
  }

  console.log(`\n🎉 Respaldo guardado en tu Escritorio: ${desktopDir}\n`);
}

ejecutar();
