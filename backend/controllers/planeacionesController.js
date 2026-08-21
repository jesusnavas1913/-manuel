const { supabase, SEDES_MAP, JORNADAS_MAP } = require('../db');

// Helper: calcular si es a tiempo (subido hasta el lunes 23:59:59 de la semana de inicio de clases)
function calcularEstado(fechaSubida, esSemanaInstitucional, fechaAplicacion) {
  if (esSemanaInstitucional) return 'semana_institucional';

  const subida = new Date(fechaSubida);
  const aplicacion = fechaAplicacion ? new Date(fechaAplicacion) : subida;

  const lunesClase = new Date(aplicacion);
  const day = lunesClase.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  lunesClase.setDate(lunesClase.getDate() + diffToMonday);
  lunesClase.setHours(23, 59, 59, 999);

  return subida <= lunesClase ? 'a_tiempo' : 'retraso';
}

// Helper: calcular número de semana ISO
function semanaISO(d) {
  const fecha = new Date(d);
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
      if (!did && req.user.correo) {
        const { data: dRows } = await supabase.from('docentes').select('id').ilike('correo', req.user.correo.toLowerCase().trim());
        if (dRows && dRows.length > 0) did = dRows[0].id;
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

  // 2. Subir buffer del PDF
  const { error: uploadError } = await supabase.storage
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

// POST /api/planeaciones
exports.create = async (req, res) => {
  let { docente_id, area, grado, fecha_aplicacion, numero_semana, nombre_archivo, observaciones } = req.body;
  let did = req.user.rol === 'docente' ? req.user.docente_id : docente_id;

  if (req.user.rol === 'docente' && (!did || isNaN(parseInt(did)))) {
    try {
      const { data: docRows } = await supabase
        .from('docentes')
        .select('id')
        .ilike('correo', req.user.correo)
        .limit(1);

      if (docRows && docRows.length > 0) {
        did = docRows[0].id;
      }
    } catch (e) {
      console.warn('Error al vincular docente por correo:', e.message);
    }
  }

  did = parseInt(did) || 1;

  // Manejo de archivo con Multer & Supabase Storage
  if (req.file) {
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Únicamente se permiten archivos en formato PDF (.pdf)' });
    }

    try {
      nombre_archivo = await uploadPdfToStorage(req.file.buffer, req.file.originalname);
    } catch (upErr) {
      return res.status(500).json({ error: upErr.message });
    }
  } else if (!nombre_archivo) {
    return res.status(400).json({ error: 'Debe adjuntar el archivo PDF de la planeación' });
  }

  try {
    const ahora = new Date();
    const targetDate = fecha_aplicacion ? new Date(fecha_aplicacion) : ahora;
    const semana = parseInt(numero_semana) || semanaISO(targetDate);
    const anioTarget = targetDate.getFullYear();

    const { data: inst } = await supabase.from('semanas_institucionales').select('id').eq('anio', anioTarget).eq('numero_semana', semana);
    const estado = calcularEstado(ahora, inst && inst.length > 0, fecha_aplicacion);

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
        fecha_aplicacion: targetDate.toISOString().split('T')[0], 
        numero_semana: semana, 
        nombre_archivo, 
        observaciones: observaciones || '', 
        estado
      }])
      .select('*');
      
    if (error) throw error;
    res.status(201).json(rows[0]);
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
    res.json(rows[0]);
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
    if (req.user.rol === 'docente') {
      const { data: planRows } = await supabase.from('planeaciones').select('*').eq('id', planId);
      if (!planRows || planRows.length === 0) return res.status(404).json({ error: 'Planeación no encontrada' });
      if (planRows[0].docente_id !== req.user.docente_id) {
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
    res.json({ message: 'Planeación eliminada correctamente.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar planeación' });
  }
};

// POST /api/planeaciones/:id/reemplazar
// Permite al docente reemplazar su PDF con verificación de contraseña
exports.reemplazar = async (req, res) => {
  const bcrypt = require('bcryptjs');
  const planId = parseInt(req.params.id);
  const { password_confirmacion } = req.body;

  if (!req.file) return res.status(400).json({ error: 'Debe adjuntar el archivo PDF' });
  if (!password_confirmacion) return res.status(400).json({ error: 'Debe confirmar su contraseña' });
  if (req.file.mimetype !== 'application/pdf') return res.status(400).json({ error: 'Solo se permiten archivos PDF' });

  try {
    // Verificar que la planeación pertenece al docente
    const { data: planRows } = await supabase.from('planeaciones').select('*').eq('id', planId);
    if (!planRows || planRows.length === 0) return res.status(404).json({ error: 'Planeación no encontrada' });
    const plan = planRows[0];

    if (req.user.rol === 'docente' && parseInt(plan.docente_id) !== parseInt(req.user.docente_id)) {
      return res.status(403).json({ error: 'No tiene permisos para reemplazar esta planeación.' });
    }

    // Verificar contraseña
    const { data: userRows } = await supabase.from('usuarios').select('*').eq('id', req.user.id);
    const userRec = userRows && userRows[0];
    if (!userRec) return res.status(401).json({ error: 'Usuario no encontrado' });
    const ok = await bcrypt.compare(password_confirmacion, userRec.password_hash);
    if (!ok) return res.status(401).json({ error: 'Contraseña incorrecta. No se pudo reemplazar el PDF.' });

    // Subir nuevo PDF a Supabase Storage mediante helper robusto
    const nuevaUrl = await uploadPdfToStorage(req.file.buffer, req.file.originalname);

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

    if (!plan.nombre_archivo) {
      return res.status(404).json({ error: 'La planeación no tiene un archivo PDF adjunto' });
    }

    let pdfUrl = plan.nombre_archivo;
    if (!pdfUrl.startsWith('http://') && !pdfUrl.startsWith('https://')) {
      pdfUrl = `https://bulrbsaoxwuibslfhlef.supabase.co/storage/v1/object/public/planeaciones_pdfs/${plan.nombre_archivo}`;
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

