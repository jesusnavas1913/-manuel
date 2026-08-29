const { supabase, SEDES_MAP, JORNADAS_MAP } = require('../db');

// Helper: Parsear fechas de forma limpia y segura sin lanzar RangeError
function parseDateSafe(dStr) {
  if (!dStr) return new Date();
  if (dStr instanceof Date) return isNaN(dStr.getTime()) ? new Date() : dStr;
  
  const str = String(dStr).trim();
  // Formato YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const parts = str.split('T')[0].split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }
  // Formato DD/MM/YYYY o DD-MM-YYYY
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(str)) {
    const parts = str.split(/[\/\-]/);
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

// Helper: calcular si es a tiempo o con retraso
function calcularEstado(fechaSubida, esSemanaInstitucional, fechaAplicacion, docenteInfo = '') {
  if (esSemanaInstitucional) return 'semana_institucional';

  // Excepción especial para Rocío, Nancy y Liliana por la incidencia técnica temporal
  const info = String(docenteInfo || '').toLowerCase();
  if (info.includes('rocio') || info.includes('rocío') || info.includes('nancy') || info.includes('liliana')) {
    return 'a_tiempo';
  }

  const subida = parseDateSafe(fechaSubida);
  const aplicacion = fechaAplicacion ? parseDateSafe(fechaAplicacion) : subida;

  // Lunes en que inicia la semana de clases
  const lunesClase = new Date(aplicacion);
  const day = lunesClase.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  lunesClase.setDate(lunesClase.getDate() + diffToMonday);
  lunesClase.setHours(0, 0, 0, 0);

  // Plazo oficial institucional: Hasta el LUNES de la semana a las 23:59:59
  // Si se entrega Viernes, Sábado, Domingo o Lunes -> 'a_tiempo'
  // Si se entrega Martes en adelante -> 'retraso'
  const plazoLunes = new Date(lunesClase);
  plazoLunes.setHours(23, 59, 59, 999);

  return subida <= plazoLunes ? 'a_tiempo' : 'retraso';
}

function semanaISO(d) {
  const base = parseDateSafe(d);
  const fecha = new Date(base.getTime());
  fecha.setHours(0, 0, 0, 0);
  fecha.setDate(fecha.getDate() + 3 - ((fecha.getDay() + 6) % 7));
  const semana1 = new Date(fecha.getFullYear(), 0, 4);
  return 1 + Math.round(((fecha - semana1) / 86400000 - 3 + ((semana1.getDay() + 6) % 7)) / 7);
}

// GET /api/planeaciones
exports.getAll = async (req, res) => {
  try {
    let query = supabase.from('planeaciones').select('*, docentes(*)').order('fecha_subida', { ascending: false });

    // Si es docente, filtrar sus planeaciones
    if (req.user.rol === 'docente') {
      let did = req.user.docente_id;
      if (!did) {
        try {
          const cleanMail = (req.user.correo || '').toLowerCase().trim();
          const cleanName = (req.user.nombre || '').toLowerCase().trim();
          const { data: docRows } = await supabase.from('docentes').select('id, correo, nombre');
          if (docRows && docRows.length > 0) {
            let match = docRows.find(d => d.correo && d.correo.toLowerCase().trim() === cleanMail);
            if (!match && cleanName) {
              match = docRows.find(d => d.nombre && d.nombre.toLowerCase().trim() === cleanName);
            }
            if (match) did = match.id;
          }
        } catch (e) {}
      }
      if (did) {
        query = query.eq('docente_id', parseInt(did));
      }
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    const mapped = (rows || []).map(p => {
      const d = p.docentes || {};
      const sId = (d && d.sede_id !== undefined && d.sede_id !== null) ? parseInt(d.sede_id) : null;
      const jId = (d && d.jornada_id !== undefined && d.jornada_id !== null) ? parseInt(d.jornada_id) : null;

      return {
        ...p,
        docente_nombre: d.nombre || 'Docente Institucional',
        docente_correo: d.correo || '',
        docente_doc: d.documento || '--',
        sede_nombre: (sId && SEDES_MAP[sId]) ? SEDES_MAP[sId] : (d.sede_nombre || 'I.E. Guaimaral'),
        jornada_nombre: (jId && JORNADAS_MAP[jId]) ? JORNADAS_MAP[jId] : (d.jornada_nombre || 'Mañana')
      };
    });

    res.json(mapped);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener planeaciones' });
  }
};

// Helper interno para subir PDF a Supabase Storage con garantía de URL pública
async function uploadPdfToStorage(buffer, originalname) {
  const safeName = `${Date.now()}_${originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;

  // 1. Asegurar bucket planeaciones_pdfs en Supabase Storage
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets && buckets.some(b => b.id === 'planeaciones_pdfs');
    if (!exists) {
      await supabase.storage.createBucket('planeaciones_pdfs', { public: true, fileSizeLimit: 52428800 });
    }
  } catch (e) {
    console.warn('Nota verificando bucket:', e.message);
  }

  // 2. Subir buffer directamente
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('planeaciones_pdfs')
    .upload(safeName, buffer, {
      contentType: 'application/pdf',
      upsert: true
    });

  if (uploadError) {
    console.error('❌ Error al subir PDF a Storage:', uploadError.message);
    throw new Error('No se pudo guardar el PDF en el servidor de almacenamiento: ' + uploadError.message);
  }

  // 3. Obtener URL pública
  const { data: publicUrlData } = supabase.storage
    .from('planeaciones_pdfs')
    .getPublicUrl(safeName);

  if (!publicUrlData || !publicUrlData.publicUrl) {
    throw new Error('No se pudo obtener la dirección pública del PDF subido.');
  }

  console.log('✅ PDF subido exitosamente a Storage:', publicUrlData.publicUrl);
  return publicUrlData.publicUrl;
}

// Helper: Re-evaluar estados de la semana para un docente
async function actualizarEstadosSemana(docenteId, numeroSemana) {
  try {
    const { data: docRowsInfo } = await supabase.from('docentes').select('nombre, correo').eq('id', docenteId);
    const docNameStr = (docRowsInfo && docRowsInfo[0]) ? `${docRowsInfo[0].nombre} ${docRowsInfo[0].correo}` : '';

    const { data: plans } = await supabase
      .from('planeaciones')
      .select('*')
      .eq('docente_id', docenteId)
      .eq('numero_semana', numeroSemana)
      .neq('estado', 'no_entrego');

    if (!plans || plans.length === 0) return;

    const { data: inst } = await supabase.from('semanas_institucionales').select('id').eq('numero_semana', numeroSemana);
    const esInst = inst && inst.length > 0;

    for (const p of plans) {
      let nuevoEstado = calcularEstado(p.fecha_subida, esInst, p.fecha_aplicacion, docNameStr);
      if (numeroSemana === 35) nuevoEstado = 'a_tiempo';
      if (p.estado !== nuevoEstado) {
        await supabase.from('planeaciones').update({ estado: nuevoEstado }).eq('id', p.id);
      }
    }
  } catch (e) {
    console.warn('Error al actualizar estados de la semana:', e.message);
  }
}

// POST /api/planeaciones
exports.create = async (req, res) => {
  let { docente_id, area, grado, fecha_aplicacion, numero_semana, nombre_archivo, observaciones } = req.body;
  let did = req.user.rol === 'docente' ? (req.user.docente_id || docente_id) : docente_id;

  if (req.user.rol === 'docente' && (!did || isNaN(parseInt(did)))) {
    try {
      const cleanMail = (req.user.correo || '').toLowerCase().trim();
      const cleanName = (req.user.nombre || '').toLowerCase().trim();

      const { data: docRows } = await supabase.from('docentes').select('id, correo, nombre');
      if (docRows && docRows.length > 0) {
        let match = docRows.find(d => d.correo && d.correo.toLowerCase().trim() === cleanMail);
        if (!match && cleanName) {
          match = docRows.find(d => d.nombre && d.nombre.toLowerCase().trim() === cleanName);
        }
        if (match) did = match.id;
      }
    } catch (e) {
      console.warn('Error al vincular docente por correo/nombre:', e.message);
    }
  }

  if (req.user.rol !== 'docente') {
    if (!did || isNaN(parseInt(did))) {
      return res.status(400).json({ error: 'Debe seleccionar el docente al que pertenece la planeación' });
    }
    did = parseInt(did);
  } else {
    did = parseInt(did);
    if (isNaN(did)) {
      return res.status(400).json({ error: 'No se pudo verificar la identidad del docente para registrar la planeación' });
    }
  }

  // Manejo de archivo con Multer & Supabase Storage
  if (req.file) {
    const origName = (req.file.originalname || '').toLowerCase();
    const isPdf = origName.endsWith('.pdf') || 
                  (req.file.mimetype && req.file.mimetype.toLowerCase().includes('pdf')) ||
                  req.file.mimetype === 'application/octet-stream';
    if (!isPdf && !origName.endsWith('.pdf')) {
      return res.status(400).json({ error: 'Únicamente se permiten archivos en formato PDF (.pdf)' });
    }

    try {
      nombre_archivo = await uploadPdfToStorage(req.file.buffer, req.file.originalname || 'planeacion.pdf');
    } catch (upErr) {
      return res.status(500).json({ error: upErr.message });
    }
  } else if (!nombre_archivo) {
    return res.status(400).json({ error: 'Debe adjuntar el archivo PDF de la planeación' });
  }

  try {
    const ahora = new Date();
    const targetDate = fecha_aplicacion ? parseDateSafe(fecha_aplicacion) : ahora;
    const semana = parseInt(numero_semana) || semanaISO(targetDate);

    const dayOfWeek = ahora.getDay();
    const currentW = Math.max(36, semanaISO(ahora));
    // Los viernes (5), sábados (6) y domingos (0) se abre la semana siguiente para planificar con anticipación
    const maxSemanaPermitida = (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) 
      ? currentW + 1 
      : currentW;

    if (req.user.rol === 'docente' && semana > maxSemanaPermitida) {
      return res.status(400).json({ 
        error: `No está permitido registrar semanas futuras no habilitadas (Semana ${semana}). Semana máxima permitida actualmente: Semana ${maxSemanaPermitida}.` 
      });
    }

    const { data: docRowsInfo } = await supabase.from('docentes').select('nombre, correo').eq('id', did);
    const docNameStr = (docRowsInfo && docRowsInfo[0]) ? `${docRowsInfo[0].nombre} ${docRowsInfo[0].correo}` : '';

    const anioTarget = targetDate.getFullYear();
    const { data: inst } = await supabase.from('semanas_institucionales').select('id').eq('anio', anioTarget).eq('numero_semana', semana);
    let estadoInicial = calcularEstado(ahora, inst && inst.length > 0, fecha_aplicacion, docNameStr);
    if (semana === 35) {
      estadoInicial = 'a_tiempo';
    }

    const yyyy = targetDate.getFullYear();
    const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getDate()).padStart(2, '0');
    const dateFormatted = `${yyyy}-${mm}-${dd}`;

    // Auto-limpiar registros previos de 'no_entrego' para este docente en la misma semana
    await supabase
      .from('planeaciones')
      .delete()
      .eq('docente_id', did)
      .eq('numero_semana', semana)
      .eq('estado', 'no_entrego');

    const { data: rows, error } = await supabase
      .from('planeaciones')
      .insert([{
        docente_id: did, 
        area: area || 'General', 
        grado: grado || 'Transición', 
        fecha_aplicacion: dateFormatted, 
        numero_semana: semana, 
        nombre_archivo, 
        observaciones: observaciones || '', 
        estado: estadoInicial
      }])
      .select('*');
      
    if (error) throw error;

    // Actualizar/re-evaluar estados de la semana
    await actualizarEstadosSemana(did, semana);

    // Re-obtener la planeación recién insertada para devolver el estado final actualizado
    const { data: updatedRows } = await supabase.from('planeaciones').select('*').eq('id', rows[0].id);

    res.status(201).json((updatedRows && updatedRows[0]) || rows[0]);
  } catch (err) {
    console.error('Error al registrar planeación:', err);
    res.status(500).json({ error: err.message || 'Error al registrar planeación' });
  }
};

// PUT /api/planeaciones/:id
// El administrador puede editar cualquier planeación.
// El docente puede editar SOLO la suya, previa verificación de contraseña.
exports.update = async (req, res) => {
  const bcrypt = require('bcryptjs');
  const { supabase } = require('../db');

  const planId = parseInt(req.params.id);
  const { area, grado, fecha_aplicacion, numero_semana, nombre_archivo, observaciones, estado, password_confirmacion } = req.body;

  try {
    // Obtener la planeación para verificar propiedad
    const { data: planRows } = await supabase.from('planeaciones').select('*').eq('id', planId);
    if (!planRows || planRows.length === 0) return res.status(404).json({ error: 'Planeación no encontrada' });
    const plan = planRows[0];

    if (req.user.rol === 'docente') {
      // Verificar que la planeación pertenece a este docente
      if (plan.docente_id !== req.user.docente_id) {
        return res.status(403).json({ error: 'No tiene permisos para editar esta planeación.' });
      }
      // Verificar contraseña obligatoriamente
      if (!password_confirmacion) {
        return res.status(400).json({ error: 'Debe confirmar su contraseña para editar la planeación.' });
      }
      const { data: userRows } = await supabase.from('usuarios').select('*').eq('id', req.user.id);
      const userRec = userRows && userRows[0];
      if (!userRec) return res.status(401).json({ error: 'Usuario no encontrado.' });
      const ok = await bcrypt.compare(password_confirmacion, userRec.password_hash);
      if (!ok) return res.status(401).json({ error: 'Contraseña incorrecta. No se puede editar la planeación.' });
    }
    // Administrador no necesita contraseña

    // Verificar restricción de semana adelantada para docentes al actualizar (máximo 1 semana adelantada)
    if (req.user.rol === 'docente' && (fecha_aplicacion || numero_semana)) {
      const targetD = fecha_aplicacion ? new Date(fecha_aplicacion) : new Date();
      const targetW = numero_semana ? parseInt(numero_semana) : semanaISO(targetD);
      const now = new Date();
      const currentW = semanaISO(now);
      const maxW = currentW + 1;

      if (targetW > maxW) {
        return res.status(400).json({
          error: `Por motivos de seguridad, los docentes no pueden ingresar o cambiar planeaciones a más de 1 semana adelantada (Máximo Semana ${maxW}).`
        });
      }
    }

    const payload = {};
    if (area !== undefined) payload.area = area;
    if (grado !== undefined) payload.grado = grado;
    if (fecha_aplicacion !== undefined) payload.fecha_aplicacion = fecha_aplicacion;
    if (numero_semana !== undefined) payload.numero_semana = parseInt(numero_semana);
    if (nombre_archivo !== undefined) payload.nombre_archivo = nombre_archivo;
    if (observaciones !== undefined) payload.observaciones = observaciones;
    if (estado !== undefined) payload.estado = estado;

    const { data: rows, error } = await supabase
      .from('planeaciones')
      .update(payload)
      .eq('id', planId)
      .select('*');

    if (error) throw error;
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'No encontrada' });

    // Actualizar/re-evaluar estados de la semana considerando el mínimo de 2 planeaciones
    const did = rows[0].docente_id || plan.docente_id;
    const wNum = rows[0].numero_semana || plan.numero_semana;
    await actualizarEstadosSemana(did, wNum);

    const { data: finalRows } = await supabase.from('planeaciones').select('*').eq('id', planId);
    res.json((finalRows && finalRows[0]) || rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar planeación' });
  }
};

// DELETE /api/planeaciones/:id
// El administrador puede eliminar cualquier planeación.
// El docente puede eliminar SOLO la suya, previa verificación de contraseña (en body.password_confirmacion).
exports.remove = async (req, res) => {
  const bcrypt = require('bcryptjs');
  const planId = parseInt(req.params.id);
  const { password_confirmacion } = req.body || {};

  try {
    const { data: planRows } = await supabase.from('planeaciones').select('*').eq('id', planId);
    if (!planRows || planRows.length === 0) return res.status(404).json({ error: 'Planeación no encontrada' });
    const plan = planRows[0];

    if (req.user.rol === 'docente') {
      if (plan.docente_id !== req.user.docente_id) {
        return res.status(403).json({ error: 'No puede eliminar planeaciones de otros docentes.' });
      }
      if (!password_confirmacion) {
        return res.status(400).json({ error: 'Debe confirmar su contraseña para eliminar la planeación.' });
      }
      const { data: userRows } = await supabase.from('usuarios').select('*').eq('id', req.user.id);
      const userRec = userRows && userRows[0];
      if (!userRec) return res.status(401).json({ error: 'Usuario no encontrado.' });
      const ok = await bcrypt.compare(password_confirmacion, userRec.password_hash);
      if (!ok) return res.status(401).json({ error: 'Contraseña incorrecta. No se puede eliminar la planeación.' });
    }

    const { data, error } = await supabase.from('planeaciones').delete().eq('id', planId).select();
    if (error) { console.error(error); return res.status(500).json({ error: 'Error al eliminar' }); }
    if (!data || data.length === 0) return res.status(404).json({ error: 'No encontrada' });

    // Actualizar/re-evaluar estados de la semana tras eliminar planeación
    await actualizarEstadosSemana(plan.docente_id, plan.numero_semana);

    res.json({ message: 'Planeación eliminada correctamente.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar planeación' });
  }
};

// POST /api/planeaciones/:id/reemplazar
// Permite al docente/administrador reemplazar su PDF
exports.reemplazar = async (req, res) => {
  const bcrypt = require('bcryptjs');
  const planId = parseInt(req.params.id);
  const { password_confirmacion, nombre_archivo } = req.body;

  let nuevaUrl = nombre_archivo;

  if (req.file) {
    const isPdf = req.file.mimetype === 'application/pdf' || 
                  req.file.mimetype === 'application/x-pdf' || 
                  (req.file.originalname && req.file.originalname.toLowerCase().endsWith('.pdf'));
    if (!isPdf) return res.status(400).json({ error: 'Solo se permiten archivos PDF' });

    try {
      nuevaUrl = await uploadPdfToStorage(req.file.buffer, req.file.originalname);
    } catch (upErr) {
      return res.status(500).json({ error: upErr.message });
    }
  }

  if (!nuevaUrl) return res.status(400).json({ error: 'Debe adjuntar el archivo PDF a reemplazar' });

  try {
    const { data: planRows } = await supabase.from('planeaciones').select('*').eq('id', planId);
    if (!planRows || planRows.length === 0) return res.status(404).json({ error: 'Planeación no encontrada' });
    const plan = planRows[0];

    if (req.user.rol === 'docente') {
      if (parseInt(plan.docente_id) !== parseInt(req.user.docente_id)) {
        return res.status(403).json({ error: 'No tiene permisos para reemplazar esta planeación.' });
      }
      if (!password_confirmacion) return res.status(400).json({ error: 'Debe confirmar su contraseña para reemplazar el archivo.' });

      const { data: userRows } = await supabase.from('usuarios').select('*').eq('id', req.user.id);
      const userRec = userRows && userRows[0];
      if (!userRec) return res.status(401).json({ error: 'Usuario no encontrado' });
      const ok = await bcrypt.compare(password_confirmacion, userRec.password_hash);
      if (!ok) return res.status(401).json({ error: 'Contraseña incorrecta. No se pudo reemplazar el PDF.' });
    }

    // Actualizar nombre_archivo en la planeación
    const { data: updated, error: updErr } = await supabase
      .from('planeaciones')
      .update({ nombre_archivo: nuevaUrl })
      .eq('id', planId)
      .select('*');

    if (updErr) throw updErr;
    res.json({ message: 'PDF reemplazado correctamente', planeacion: updated[0] });
  } catch (err) {
    console.error('Error al reemplazar PDF:', err);
    res.status(500).json({ error: err.message || 'Error al reemplazar PDF' });
  }
};

// GET /api/planeaciones/:id/descargar
// Descarga directa proxy del PDF con headers de disposición de archivo adjunto
exports.download = async (req, res) => {
  try {
    const planId = parseInt(req.params.id);
    const { data: planRows } = await supabase.from('planeaciones').select('*, docentes(*)').eq('id', planId);
    if (!planRows || planRows.length === 0) {
      return res.status(404).json({ error: 'Planeación no encontrada' });
    }
    const plan = planRows[0];

    // Si es una planeación generada por Rector IA, servir vista imprimible oficial
    if (plan.observaciones && plan.observaciones.includes('[REVISION_IA_JSON]:')) {
      let secData = null;
      let metaData = {};
      try {
        const jsonStr = plan.observaciones.split('[REVISION_IA_JSON]:')[1];
        const parsed = JSON.parse(jsonStr);
        secData = parsed.secuencia || parsed;
        metaData = parsed;
      } catch (e) {}

      const docName = (plan.docentes && plan.docentes.nombre) || plan.docente_nombre || 'Docente';
      const acts = secData?.actividades || [];

      const htmlDoc = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Planeación Didáctica - ${docName} - Semana ${plan.numero_semana || ''}</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #000000; margin: 0; padding: 24px; background: #e2e8f0; }
    p, div, span, strong, td, th, li { color: #000000; }
    .page-container { max-width: 960px; margin: 0 auto; background: #ffffff; padding: 32px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); border: 1.5px solid #000000; }
    h1, h2, h3, h4 { margin: 0; color: #000000; }
    .header-box { text-align: center; border-bottom: 2px solid #000000; padding-bottom: 16px; margin-bottom: 20px; }
    .inst-title { font-size: 22px; font-weight: 900; color: #000000; letter-spacing: 0.5px; }
    .inst-sub { font-size: 13px; font-weight: 800; color: #000000; text-transform: uppercase; margin-top: 4px; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; font-size: 12.5px; background: #f8fafc; padding: 14px; border: 1.5px solid #000000; border-radius: 6px; margin-bottom: 20px; text-align: left; color: #000000; }
    .section-card { border: 1.5px solid #000000; border-radius: 6px; padding: 16px; margin-bottom: 16px; background: #fff; color: #000000; }
    .section-title { font-size: 13px; font-weight: 900; background: #EDF7ED; color: #000000; border-bottom: 1.5px solid #000000; padding: 6px 10px; margin: -16px -16px 12px -16px; border-radius: 4px 4px 0 0; text-align: center; }
    .sesion-card { border: 1.5px solid #000000; border-radius: 6px; overflow: hidden; margin-bottom: 14px; }
    .sesion-head { background: #000000; color: #ffffff; padding: 8px 14px; font-weight: 900; font-size: 13px; display: flex; justify-content: space-between; }
    .sesion-head * { color: #ffffff !important; }
    .sesion-body { padding: 12px; display: flex; flex-direction: column; gap: 8px; font-size: 12.5px; color: #000000; }
    .fase-box { padding: 8px 12px; border-radius: 4px; border: 1px solid #000000; color: #000000; }
    .fase-inicio { background: #f0fdf4; border-left: 4.5px solid #16a34a; }
    .fase-desarrollo { background: #eff6ff; border-left: 4.5px solid #2563eb; }
    .fase-cierre { background: #fdf4ff; border-left: 4.5px solid #c026d3; }
    @media print {
      body { background: #fff; padding: 0; color: #000000; }
      .page-container { box-shadow: none; border: none; padding: 0; }
      .no-print { display: none !important; }
      @page { margin: 10mm; size: letter portrait; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="max-width:960px; margin: 0 auto 16px; display: flex; justify-content: space-between; align-items: center; background: #0f172a; padding: 12px 20px; border-radius: 10px; color: #fff;">
    <div><strong>✨ Secuencia Didáctica Rector 2.0 AI</strong> (Institución Educativa Guaimaral)</div>
    <button onclick="window.print()" style="padding: 8px 18px; background: #0284c7; color: #fff; border: none; border-radius: 6px; font-weight: 700; cursor: pointer;">🖨️ Imprimir / Guardar PDF</button>
  </div>
  <div class="page-container">
    <div style="display:flex; gap:16px; align-items:center; margin-bottom:16px; border-bottom:2.5px solid #0f172a; padding-bottom:12px;">
      <div style="width:75px; height:75px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
        <img src="/assets/img/logo_guaimaral.png" onerror="this.src='/assets/img/escudo.png'" style="max-width:75px; max-height:75px; object-fit:contain;" alt="Logo" />
      </div>
      <div style="flex-grow:1; text-align:center;">
        <h1 style="font-size:20px; font-weight:900; text-transform:uppercase; color:#0f172a; margin:0;">INSTITUCIÓN EDUCATIVA GUAIMARAL</h1>
        <div style="margin-top:6px; padding:4px 0; border-top:1px solid #334155; border-bottom:1px solid #334155;">
          <h2 style="font-size:11.5px; font-weight:800; text-transform:uppercase; color:#334155; margin:0;">PROCESO: GESTIÓN ACADÉMICA - PREPARACIÓN DE CLASES</h2>
        </div>
        <p style="font-size:10px; color:#64748b; margin:4px 0 0; font-weight:700; font-style:italic;">"Calidad Humana y Excelencia Académica"</p>
      </div>
    </div>
    <div class="meta-grid">
      <div><strong>Docente:</strong> ${docName}</div>
      <div><strong>Área / Asignatura:</strong> ${plan.area || '-'}</div>
      <div><strong>Grado:</strong> ${plan.grado || '-'}</div>
      <div><strong>Semana:</strong> Semana ${plan.numero_semana || '-'}</div>
      <div><strong>Fecha de Aplicación:</strong> ${plan.fecha_aplicacion || '-'}</div>
      <div><strong>Sesiones:</strong> ${acts.length} clases</div>
      <div><strong>Eje CRESE:</strong> ${secData?.eje_crese_utilizado || 'Educación Socioemocional y Ciudadana'}</div>
    </div>
    <div class="section-card">
      <div class="section-title">1. FUNDAMENTACIÓN CURRICULAR (MEN & DBA)</div>
      <p style="margin: 6px 0;"><strong>🎯 Objetivo de Aprendizaje:</strong> ${secData?.objetivo_aprendizaje || 'Comprender y aplicar los conceptos fundamentales.'}</p>
      <p style="margin: 6px 0;"><strong>📜 Estándar MEN:</strong> ${secData?.estandar || secData?.competencias_men || 'Desarrollo de competencias según lineamientos del MEN.'}</p>
      ${secData?.dba_utilizado ? `<p style="margin: 6px 0;"><strong>🌟 DBA:</strong> ${secData.dba_utilizado}</p>` : ''}
    </div>
    <div class="section-card">
      <div class="section-title">2. DESARROLLO DE LA SECUENCIA DIDÁCTICA (${acts.length} Sesiones)</div>
      ${acts.map((act, i) => `
        <div class="sesion-card">
          <div class="sesion-head">
            <span>📚 Sesión ${act.sesion || i + 1}: ${secData?.tema_principal || 'Desarrollo Temático'}</span>
            <span>⏱️ ${act.tiempo || '2 Horas'}</span>
          </div>
          <div class="sesion-body">
            <div class="fase-box fase-inicio"><strong>🌱 Fase 1 - Inicio:</strong> ${act.fase_inicio || act.descripcion || '-'}</div>
            <div class="fase-box fase-desarrollo"><strong>⚙️ Fase 2 - Desarrollo:</strong> ${act.fase_desarrollo || '-'}</div>
            <div class="fase-box fase-cierre"><strong>🎯 Fase 3 - Cierre:</strong> ${act.fase_cierre || '-'}</div>
          </div>
        </div>
      `).join('')}
    </div>
  </div>
  <script>
    if (window.location.search.includes('print=1')) {
      window.onload = function() { setTimeout(function() { window.print(); }, 400); };
    }
  </script>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(htmlDoc);
    }

    if (!plan.nombre_archivo) {
      return res.status(404).json({ error: 'La planeación no tiene un archivo PDF adjunto' });
    }

    let pdfUrl = plan.nombre_archivo;
    if (!pdfUrl.startsWith('http://') && !pdfUrl.startsWith('https://')) {
      pdfUrl = `https://bulrbsaoxwuibslfhlef.supabase.co/storage/v1/object/public/planeaciones_pdfs/${encodeURIComponent(plan.nombre_archivo)}`;
    }

    const response = await fetch(pdfUrl);
    if (!response.ok) {
      return res.status(404).json({ error: 'El archivo PDF no está disponible en el almacenamiento' });
    }

    const raw = plan.nombre_archivo.split('/').pop().split('?')[0];
    const clean = raw.replace(/^\d+_[_\-]*/, '') || 'Planeacion_Didactica.pdf';
    const finalName = clean.endsWith('.pdf') ? clean : `${clean}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalName)}"`);

    const arrayBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('Error al procesar descarga de PDF:', err);
    return res.status(500).json({ error: 'Error al procesar la descarga del PDF: ' + err.message });
  }
};

// POST /api/planeaciones/recibir
// Recibe planeaciones generadas con IA desde la plataforma rector-2--main
exports.recibirDesdeRector = async (req, res) => {
  try {
    const {
      docente_email,
      docente_nombre,
      area,
      grado,
      tema,
      periodo,
      sesiones,
      duracion_clases,
      numero_semana,
      fecha_aplicacion,
      secuencia_json,
      taller_imprimible,
      fecha_envio
    } = req.body;

    if (!docente_email && !docente_nombre) {
      return res.status(400).json({ error: 'Se requiere información del docente (correo o nombre).' });
    }

    const cleanEmail = (docente_email || '').toLowerCase().trim();
    const cleanName = (docente_nombre || '').toLowerCase().trim();
    const firstPart = cleanEmail ? cleanEmail.split('@')[0].replace(/[._-]/g, ' ') : '';

    // 1. Buscar docente en la base de datos
    let docente = null;
    const { data: docs } = await supabase
      .from('docentes')
      .select('*')
      .ilike('correo', cleanEmail);

    if (docs && docs.length > 0) {
      docente = docs[0];
    } else {
      const searchTarget = cleanName || firstPart;
      const { data: dByName } = await supabase
        .from('docentes')
        .select('*')
        .or(`nombre.ilike.%${searchTarget}%,correo.ilike.%${firstPart}%`);
      if (dByName && dByName.length > 0) docente = dByName[0];
    }

    if (!docente) {
      const { data: newDoc } = await supabase.from('docentes').insert([{
        nombre: docente_nombre || (cleanEmail ? cleanEmail.split('@')[0] : 'Docente'),
        correo: cleanEmail,
        clave_inicial: 'guaimaral2026',
        estado: 'activo'
      }]).select('*');
      docente = newDoc && newDoc[0];
    }

    if (!docente) {
      return res.status(400).json({ error: 'No se pudo identificar ni registrar al docente en SIGEP-IEG.' });
    }

    // 2. Verificar estado de la cuenta (activo / pago)
    if (docente.activo === false) {
      return res.status(403).json({
        error: 'Acceso no permitido: La cuenta del docente no se encuentra activa o presenta pagos pendientes en SIGEP-IEG.'
      });
    }

    const did = docente.id;
    const ahora = new Date();
    
    // Determinar fecha de aplicación y número de semana
    let dateFormatted;
    let targetDate;
    if (fecha_aplicacion) {
      dateFormatted = String(fecha_aplicacion).trim();
      targetDate = parseDateSafe(fecha_aplicacion);
    } else {
      targetDate = ahora;
      const yyyy = targetDate.getFullYear();
      const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
      const dd = String(targetDate.getDate()).padStart(2, '0');
      dateFormatted = `${yyyy}-${mm}-${dd}`;
    }

    const semana = numero_semana ? parseInt(numero_semana) : semanaISO(targetDate);
    const anioTarget = targetDate.getFullYear();
    const cantClases = duracion_clases ? parseInt(duracion_clases) : (sesiones ? parseInt(sesiones) : 1);

    const dayOfWeek = ahora.getDay();
    // Desde el viernes se habilita la semana entrante para planificar con anticipación
    const maxSemanaPermitida = (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) 
      ? Math.max(36, semanaISO(ahora)) + 1 
      : Math.max(36, semanaISO(ahora));

    if (semana > maxSemanaPermitida) {
      return res.status(400).json({ 
        error: `No está permitido registrar semanas futuras no habilitadas (Semana ${semana}). Semana máxima permitida actualmente: Semana ${maxSemanaPermitida}.` 
      });
    }

    const { data: inst } = await supabase
      .from('semanas_institucionales')
      .select('id')
      .eq('anio', anioTarget)
      .eq('numero_semana', semana);

    const docNameStr = `${docente.nombre || ''} ${docente.correo || ''}`;
    let estadoInicial = calcularEstado(ahora, inst && inst.length > 0, targetDate, docNameStr);
    if (semana === 35) estadoInicial = 'a_tiempo';

    // Limpiar falta previa de no_entrego
    await supabase
      .from('planeaciones')
      .delete()
      .eq('docente_id', did)
      .eq('numero_semana', semana)
      .eq('estado', 'no_entrego');

    const cleanTema = (tema || 'Planeacion_Didactica')
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileNameVirtual = `Planeacion_IA_${cleanTema.substring(0, 45)}.pdf`;

    let obs = '';
    if (secuencia_json) {
      obs = '[REVISION_IA_JSON]:' + JSON.stringify({
        tema: tema || '',
        periodo: periodo || '1',
        sesiones: cantClases,
        secuencia: secuencia_json,
        taller: taller_imprimible || null
      });
    } else {
      obs = `Planeación generada con IA - ${cantClases} Clase(s)`;
    }

    const { data: rows, error } = await supabase
      .from('planeaciones')
      .insert([{
        docente_id: did,
        area: area || 'General',
        grado: grado || 'General',
        fecha_aplicacion: dateFormatted,
        fecha_subida: ahora.toISOString(),
        numero_semana: semana,
        nombre_archivo: fileNameVirtual,
        observaciones: obs,
        estado: estadoInicial
      }])
      .select('*');

    if (error) throw error;

    await actualizarEstadosSemana(did, semana);

    console.log(`✅ Planeación recibida desde Rector 2.0 para docente ${docente.nombre} (Semana ${semana})`);

    return res.status(201).json({
      ok: true,
      mensaje: `Planeación recibida y registrada exitosamente en SIGEP-IEG para la Semana ${semana}.`,
      planeacion: rows && rows[0]
    });
  } catch (err) {
    console.error('Error en recibirDesdeRector:', err);
    return res.status(500).json({ error: 'Error al procesar la planeación en SIGEP-IEG: ' + err.message });
  }
};

const ALL_COLOMBIAN_AREAS = [
  'Matemáticas',
  'Humanidades y Lengua Castellana',
  'Idioma Extranjero (Inglés)',
  'Ciencias Naturales y Ed. Ambiental',
  'Física',
  'Química',
  'Biología',
  'Ciencias Sociales, Historia y Geografía',
  'Constitución Política y Cátedra de la Paz',
  'Educación Artística y Cultural',
  'Educación Física, Recreación y Deportes',
  'Educación Ética y en Valores Humanos',
  'Educación Religiosa',
  'Tecnología e Informática',
  'Filosofía',
  'Ciencias Económicas y Políticas',
  'Cátedra de Estudios Afrocolombianos',
  'Lectura Crítica'
];

const ALL_COLOMBIAN_GRADES = [
  { value: 'Prejardín', label: 'Prejardín' },
  { value: 'Jardín', label: 'Jardín' },
  { value: 'Transición', label: 'Transición' },
  { value: '1°', label: '1° Primaria' },
  { value: '2°', label: '2° Primaria' },
  { value: '3°', label: '3° Primaria' },
  { value: '4°', label: '4° Primaria' },
  { value: '5°', label: '5° Primaria' },
  { value: '6°', label: '6° Secundaria' },
  { value: '7°', label: '7° Secundaria' },
  { value: '8°', label: '8° Secundaria' },
  { value: '9°', label: '9° Secundaria' },
  { value: '10°', label: '10° Media Technical' },
  { value: '11°', label: '11° Media Technical' },
  { value: 'Multigrado', label: 'Multigrado' }
];

function getMondayOfISOWeek(w, year = new Date().getFullYear()) {
  const jan4 = new Date(year, 0, 4);
  const day = jan4.getDay() || 7;
  const mondayWeek1 = new Date(year, 0, 4 - (day - 1));
  const mondayTarget = new Date(mondayWeek1);
  mondayTarget.setDate(mondayWeek1.getDate() + (w - 1) * 7);
  const yyyy = mondayTarget.getFullYear();
  const mm = String(mondayTarget.getMonth() + 1).padStart(2, '0');
  const dd = String(mondayTarget.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// GET /api/planeaciones/config-entrega
// Provee la configuración oficial en tiempo real para que Rector IA no tenga doble lógica
exports.getConfigEntrega = async (req, res) => {
  try {
    const { docente_email } = req.query;
    const now = new Date();
    const currentW = Math.max(36, semanaISO(now));
    
    // Semanas institucionales de la BD
    const { data: instWeeks } = await supabase
      .from('semanas_institucionales')
      .select('*')
      .eq('anio', now.getFullYear());

    // Docente específico si viene el correo
    let docAreas = [];
    let docGrados = [];
    if (docente_email) {
      const { data: docs } = await supabase
        .from('docentes')
        .select('*')
        .ilike('correo', String(docente_email).toLowerCase().trim());
      if (docs && docs[0]) {
        if (docs[0].areas) docAreas = docs[0].areas.split(',').map(s => s.trim()).filter(Boolean);
        if (docs[0].grados) docGrados = docs[0].grados.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    const dayOfWeek = now.getDay();
    // Los viernes, sábados y domingos se abre la semana entrante (Semana 36) para que los docentes planifiquen a tiempo
    const semanaAbiertaMax = (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) 
      ? currentW + 1 
      : currentW;

    // Generar catálogo de semanas
    const EVALUACION_INICIO_SEMANA = 32;
    const semanas = [];
    for (let w = semanaAbiertaMax; w >= EVALUACION_INICIO_SEMANA; w--) {
      const isCur = w === currentW;
      const isNext = w === currentW + 1;
      const esInst = (instWeeks || []).some(i => i.numero_semana === w);
      
      let label = `Semana ${w}`;
      if (esInst) label += ' (Institucional / Receso)';
      else if (isNext) label += ' (Próxima Semana - Abierta desde Viernes)';
      else if (isCur) label += ' (Semana Actual - En Curso)';
      else label += ' (Anterior)';

      const mondayStr = getMondayOfISOWeek(w, now.getFullYear());

      semanas.push({
        numero: w,
        label,
        es_actual: isCur,
        es_proxima: isNext,
        es_institucional: esInst,
        fecha_lunes: mondayStr
      });
    }

    // Calcular domingo de la semana máxima permitida como fecha máxima
    const mondayObj = new Date(getMondayOfISOWeek(semanaAbiertaMax, now.getFullYear()) + 'T12:00:00');
    const sundayObj = new Date(mondayObj);
    sundayObj.setDate(sundayObj.getDate() + 6);
    const yyyy = sundayObj.getFullYear();
    const mm = String(sundayObj.getMonth() + 1).padStart(2, '0');
    const dd = String(sundayObj.getDate()).padStart(2, '0');
    const fechaMaxima = `${yyyy}-${mm}-${dd}`;

    res.json({
      semana_actual: currentW,
      semana_abierta_max: semanaAbiertaMax,
      fecha_lunes_actual: getMondayOfISOWeek(currentW, now.getFullYear()),
      fecha_maxima: fechaMaxima,
      semanas,
      areas: ALL_COLOMBIAN_AREAS,
      grados: ALL_COLOMBIAN_GRADES,
      docente_asignaciones: {
        areas: docAreas,
        grados: docGrados
      }
    });
  } catch (e) {
    console.error('Error en getConfigEntrega:', e);
    res.status(500).json({ error: e.message });
  }
};

