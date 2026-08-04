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
      return {
        ...p,
        docente_nombre: d.nombre || 'Docente Institucional',
        docente_correo: d.correo || '',
        docente_doc: d.documento || '--',
        sede_nombre: SEDES_MAP[d.sede_id || 1] || 'I.E. Guaimaral',
        jornada_nombre: JORNADAS_MAP[d.jornada_id || 1] || 'Mañana'
      };
    });

    res.json(mapped);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener planeaciones' });
  }
};

// POST /api/planeaciones - Creación ultra resiliente con Auto-Healing de Docente
exports.create = async (req, res) => {
  const { docente_id, area, grado, fecha_aplicacion, numero_semana, observaciones } = req.body;
  let nombre_archivo = req.body.nombre_archivo;

  let did = req.user.rol === 'docente' ? req.user.docente_id : docente_id;

  // Auto-recuperación de ID del docente por correo o nombre si no viene en el token
  if (!did && req.user.correo) {
    const { data: dRows } = await supabase.from('docentes').select('id').ilike('correo', req.user.correo.toLowerCase().trim());
    if (dRows && dRows.length > 0) did = dRows[0].id;
  }

  if (!did && req.user.nombre) {
    const { data: dName } = await supabase.from('docentes').select('id').ilike('nombre', `%${req.user.nombre}%`);
    if (dName && dName.length > 0) did = dName[0].id;
  }

  // Si el docente no existe en la tabla 'docentes', crearlo automáticamente al vuelo
  if (!did) {
    try {
      const { data: newDoc } = await supabase.from('docentes').insert([{
        nombre: req.user.nombre || 'Docente Institucional',
        correo: req.user.correo || 'docente@guaimaral.edu.co',
        clave_inicial: 'admin123'
      }]).select('id');
      if (newDoc && newDoc.length > 0) did = newDoc[0].id;
    } catch (e) {
      // Fallback: traer el primer docente existente
      const { data: anyDoc } = await supabase.from('docentes').select('id').limit(1);
      if (anyDoc && anyDoc.length > 0) did = anyDoc[0].id;
    }
  }

  did = parseInt(did) || 1;

  // Manejo de archivo con Multer & Supabase Storage
  if (req.file) {
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ error: 'Únicamente se permiten archivos en formato PDF (.pdf)' });
    }

    const safeName = `${Date.now()}_${req.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;

    try {
      // Intentar subir a Supabase Storage (bucket: planeaciones_pdfs)
      const { error: uploadError } = await supabase.storage
        .from('planeaciones_pdfs')
        .upload(safeName, req.file.buffer, {
          contentType: 'application/pdf',
          upsert: true
        });

      if (!uploadError) {
        const { data: publicUrlData } = supabase.storage
          .from('planeaciones_pdfs')
          .getPublicUrl(safeName);
        nombre_archivo = publicUrlData.publicUrl;
        console.log('✅ PDF subido a Supabase Storage:', safeName);
      } else {
        console.error('⚠️ Error al subir PDF a Storage:', uploadError.message);
        // Guardar solo el nombre del archivo como fallback
        nombre_archivo = req.file.originalname;
      }
    } catch (sErr) {
      console.error('⚠️ Excepción al subir PDF:', sErr.message);
      nombre_archivo = req.file.originalname;
    }
  } else if (!nombre_archivo) {
    nombre_archivo = 'Planeacion_Didactica.pdf';
  }

  try {
    const ahora = new Date();
    const targetDate = fecha_aplicacion ? new Date(fecha_aplicacion) : ahora;
    const semana = parseInt(numero_semana) || semanaISO(targetDate);
    const anioTarget = targetDate.getFullYear();

    const { data: inst } = await supabase.from('semanas_institucionales').select('id').eq('anio', anioTarget).eq('numero_semana', semana);
    const estado = calcularEstado(ahora, inst && inst.length > 0, fecha_aplicacion);

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
exports.update = async (req, res) => {
  if (req.user.rol !== 'administrador')
    return res.status(403).json({ error: 'Sin permisos' });

  const { area, grado, fecha_aplicacion, numero_semana, nombre_archivo, observaciones, estado } = req.body;
  try {
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
      .eq('id', parseInt(req.params.id))
      .select('*');
      
    if (error) throw error;
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar' });
  }
};

// DELETE /api/planeaciones/:id
exports.remove = async (req, res) => {
  if (req.user.rol !== 'administrador')
    return res.status(403).json({ error: 'Sin permisos' });

  const { data, error } = await supabase.from('planeaciones').delete().eq('id', parseInt(req.params.id)).select();
  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al eliminar' });
  }
  if (!data || data.length === 0) return res.status(404).json({ error: 'No encontrada' });
  res.json({ message: 'Eliminada' });
};
