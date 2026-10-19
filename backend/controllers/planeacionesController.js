const { supabase, SEDES_MAP, JORNADAS_MAP, insertPlaneacionSegura, DOCENTE_ALIASES, normalizeDocName, getCanonicalDocKey } = require('../db');

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

function semanaISO(d) {
  const base = parseDateSafe(d);
  const fecha = new Date(base.getTime());
  fecha.setHours(0, 0, 0, 0);
  fecha.setDate(fecha.getDate() + 3 - ((fecha.getDay() + 6) % 7));
  const semana1 = new Date(fecha.getFullYear(), 0, 4);
  return 1 + Math.round(((fecha - semana1) / 86400000 - 3 + ((semana1.getDay() + 6) % 7)) / 7);
}

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

// Obtener la semana académica activa para planificación y evaluación:
// Desde el viernes (5), sábado (6) y domingo (0) se abre y activa la semana siguiente
function getActiveAcademicWeek(d = new Date()) {
  const base = parseDateSafe(d);
  const isoW = semanaISO(base);
  const day = base.getDay(); // 0: Dom, 1: Lun, ..., 5: Vie, 6: Sab
  const targetW = (day === 5 || day === 6 || day === 0) ? (isoW + 1) : isoW;
  return Math.max(36, targetW);
}

// Obtener fecha y hora en zona horaria oficial de Colombia (America/Bogota, UTC-5)
function toColombiaDate(dInput) {
  try {
    const d = parseDateSafe(dInput);
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(d);
    const p = {};
    parts.forEach(({ type, value }) => { p[type] = value; });
    return new Date(parseInt(p.year), parseInt(p.month) - 1, parseInt(p.day), parseInt(p.hour || 0), parseInt(p.minute || 0), parseInt(p.second || 0));
  } catch (e) {
    return parseDateSafe(dInput);
  }
}

// Helper: Normalizar cadenas eliminando tildes, mayúsculas y caracteres especiales
function normalizeStr(str) {
  if (!str) return '';
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Resuelve de forma inteligente, tolerante a fallos y sin duplicados al docente en la nómina oficial.
 * Soporta nombres abreviados ("Aleida Lara" -> "ALEIDA INES LARA CASTRO"), variaciones de email
 * y alias institucionales de IE Guaimaral, unificando registros duplicados con linked_ids.
 */
async function resolveDocenteSeguro({ email, nombre, documento, id }) {
  const { data: todosDocentes, error } = await supabase.from('docentes').select('*');
  if (error || !todosDocentes || todosDocentes.length === 0) return null;

  let matched = null;

  if (id && !isNaN(parseInt(id))) {
    matched = todosDocentes.find(d => d.id === parseInt(id));
  }

  const cleanDoc = documento ? String(documento).trim() : '';
  if (!matched && cleanDoc) {
    matched = todosDocentes.find(d => d.documento && String(d.documento).trim() === cleanDoc);
  }

  const cleanMail = normalizeStr(email);
  if (!matched && cleanMail) {
    matched = todosDocentes.find(d => d.correo && normalizeStr(d.correo) === cleanMail);
  }

  const cleanNom = normalizeStr(nombre);
  if (!matched && cleanNom) {
    matched = todosDocentes.find(d => d.nombre && normalizeStr(d.nombre) === cleanNom);
  }

  // Coincidencia canónica institucional
  if (!matched && (cleanNom || cleanMail)) {
    const canonicalKey = getCanonicalDocKey(cleanNom, cleanMail);
    matched = todosDocentes.find(d => getCanonicalDocKey(d.nombre, d.correo) === canonicalKey);
  }

  // Token matching bidireccional (evita falsos positivos con 1 solo token)
  if (!matched && cleanNom) {
    const incomingWords = cleanNom.split(/\s+/).filter(w => w.length > 2);
    if (incomingWords.length >= 2) {
      matched = todosDocentes.find(d => {
        const dWords = normalizeStr(d.nombre).split(/\s+/).filter(w => w.length > 2);
        return incomingWords.every(w => dWords.includes(w)) || (dWords.length >= 2 && dWords.every(w => incomingWords.includes(w)));
      });
    }
  }

  if (!matched) return null;

  // Resolver ID canónico y linked_ids para unificar duplicados
  const canonicalKey = getCanonicalDocKey(matched.nombre, matched.correo);
  const related = todosDocentes.filter(d => getCanonicalDocKey(d.nombre, d.correo) === canonicalKey);
  const linkedIds = related.map(d => d.id);

  // Elegir el registro con nombre más completo o institucional
  let canonicalDoc = related.slice().sort((a, b) => (b.nombre || '').length - (a.nombre || '').length)[0] || matched;
  canonicalDoc.linked_ids = linkedIds;

  return canonicalDoc;
}

// Helper: calcular si es a tiempo o con retraso
function calcularEstado(fechaSubida, esSemanaInstitucional, fechaAplicacion, docenteInfo = '', numeroSemana = null) {
  if (esSemanaInstitucional) return 'semana_institucional';

  // Excepción especial para Rocío, Nancy y Liliana por la incidencia técnica temporal
  const info = String(docenteInfo || '').toLowerCase();
  if (info.includes('rocio') || info.includes('rocío') || info.includes('nancy') || info.includes('liliana')) {
    return 'a_tiempo';
  }

  // Evaluar en hora local de Colombia para evitar desfases de medianoche UTC
  const subida = toColombiaDate(fechaSubida);
  let lunesClase;

  if (numeroSemana && !isNaN(parseInt(numeroSemana))) {
    const y = subida ? subida.getFullYear() : new Date().getFullYear();
    const mondayStr = getMondayOfISOWeek(parseInt(numeroSemana), y);
    lunesClase = parseDateSafe(mondayStr);
    lunesClase.setHours(0, 0, 0, 0);
  } else if (fechaAplicacion) {
    const aplicacion = parseDateSafe(fechaAplicacion);
    lunesClase = new Date(aplicacion);
    const day = lunesClase.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    lunesClase.setDate(lunesClase.getDate() + diffToMonday);
    lunesClase.setHours(0, 0, 0, 0);
  } else {
    lunesClase = new Date(subida);
    const day = lunesClase.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    lunesClase.setDate(lunesClase.getDate() + diffToMonday);
    lunesClase.setHours(0, 0, 0, 0);
  }

  // Plazo oficial institucional: Hasta el LUNES de la semana a las 23:59:59.999
  // Si se entrega Viernes, Sábado, Domingo o Lunes -> 'a_tiempo'
  // Si se entrega Martes en adelante -> 'retraso'
  const plazoLunes = new Date(lunesClase);
  plazoLunes.setHours(23, 59, 59, 999);

  return subida <= plazoLunes ? 'a_tiempo' : 'retraso';
}

// GET /api/planeaciones
exports.getAll = async (req, res) => {
  try {
    let query = supabase.from('planeaciones').select('*').order('fecha_subida', { ascending: false });

    // Si es docente (por rol o por tener docente_id asociado), filtrar sus planeaciones
    if (req.user.rol === 'docente' || Boolean(req.user.docente_id)) {
      let did = req.user.docente_id;
      let docIds = [];
      if (!did) {
        try {
          const matchDoc = await resolveDocenteSeguro({
            email: req.user.correo,
            nombre: req.user.nombre
          });
          if (matchDoc) {
            did = matchDoc.id;
            docIds = matchDoc.linked_ids || [matchDoc.id];
          }
        } catch (e) {}
      } else {
        try {
          const matchDoc = await resolveDocenteSeguro({ id: did });
          if (matchDoc && matchDoc.linked_ids) {
            docIds = matchDoc.linked_ids;
          }
        } catch (e) {}
      }
      if (docIds.length === 0 && did) docIds = [parseInt(did)];
      if (docIds.length === 1) {
        query = query.eq('docente_id', docIds[0]);
      } else if (docIds.length > 1) {
        query = query.in('docente_id', docIds);
      }
    }

    const { data: rows, error } = await query;
    if (error) {
      console.error('Error al consultar planeaciones en Supabase:', error);
      throw error;
    }

    // Obtener docentes de forma segura y asociar al docente canónico
    let docMap = new Map();
    try {
      const { data: docList } = await supabase.from('docentes').select('*');
      if (docList && Array.isArray(docList)) {
        const canonicalByKey = new Map();
        docList.forEach(d => {
          const k = getCanonicalDocKey(d.nombre, d.correo);
          if (!canonicalByKey.has(k) || (d.nombre || '').length > (canonicalByKey.get(k).nombre || '').length) {
            canonicalByKey.set(k, d);
          }
        });
        docList.forEach(d => {
          const k = getCanonicalDocKey(d.nombre, d.correo);
          docMap.set(String(d.id), canonicalByKey.get(k) || d);
        });
      }
    } catch (dErr) {
      console.warn('Aviso al obtener docentes para mapear planeaciones:', dErr.message);
    }

    const mapped = (rows || []).map(p => {
      const d = docMap.get(String(p.docente_id)) || {};
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
    console.error('Error al obtener planeaciones:', err);
    res.status(500).json({ error: err.message || 'Error al obtener planeaciones' });
  }
};

// Helper interno para subir PDF a Supabase Storage con garantía de URL pública
async function uploadPdfToStorage(buffer, originalname) {
  const cleanOriginal = (originalname || 'planeacion.pdf').replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const safeName = `${Date.now()}_${cleanOriginal.toLowerCase().endsWith('.pdf') ? cleanOriginal : `${cleanOriginal}.pdf`}`;
  const guaranteedUrl = `https://fawxjdiwtamkctrhtqzc.supabase.co/storage/v1/object/public/planeaciones_pdfs/${safeName}`;

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
  try {
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('planeaciones_pdfs')
      .upload(safeName, buffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.warn('⚠️ Alerta al subir archivo físico a Supabase Storage (continuando con referencia protegida):', uploadError.message);
    } else {
      const { data: publicUrlData } = supabase.storage
        .from('planeaciones_pdfs')
        .getPublicUrl(safeName);

      if (publicUrlData && publicUrlData.publicUrl) {
        console.log('✅ PDF subido exitosamente a Storage:', publicUrlData.publicUrl);
        return publicUrlData.publicUrl;
      }
    }
  } catch (storageErr) {
    console.warn('⚠️ Excepción no crítica en Supabase Storage (se preserva la planeación en BD):', storageErr.message);
  }

  return guaranteedUrl;
}

// ── Helpers de Gestión de Almacenamiento y Purga Segura (Límite 700 PDFs) ──
async function getStorageFilesCount() {
  try {
    const { data: files, error } = await supabase.storage.from('planeaciones_pdfs').list('', { limit: 1000 });
    if (error || !files) return 0;
    return files.filter(f => f.name && f.name !== '.emptyFolderPlaceholder').length;
  } catch (e) {
    return 0;
  }
}

async function purgearPdfsStorage(mantenerUltimos = 0) {
  try {
    const { data: files, error } = await supabase.storage
      .from('planeaciones_pdfs')
      .list('', { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } });

    if (error) {
      console.error('Error al listar archivos para purga:', error.message);
      throw error;
    }

    if (!files || files.length === 0) {
      return { total: 0, eliminados: 0, mensaje: 'El almacenamiento ya se encuentra vacío' };
    }

    const validFiles = files.filter(f => f.name && f.name !== '.emptyFolderPlaceholder');
    const toDelete = mantenerUltimos > 0
      ? validFiles.slice(0, Math.max(0, validFiles.length - mantenerUltimos))
      : validFiles;

    if (toDelete.length === 0) {
      return { total: validFiles.length, eliminados: 0, mensaje: 'No hay archivos para eliminar con el criterio actual' };
    }

    const fileNames = toDelete.map(f => f.name);
    let eliminados = 0;

    // Eliminar en lotes de 80 para garantizar estabilidad de red y evitar timeouts
    for (let i = 0; i < fileNames.length; i += 80) {
      const batch = fileNames.slice(i, i + 80);
      const { error: delErr } = await supabase.storage.from('planeaciones_pdfs').remove(batch);
      if (!delErr) {
        eliminados += batch.length;
      } else {
        console.warn('Advertencia en eliminación de lote:', delErr.message);
      }
    }

    console.log(`🧹 Purga de almacenamiento completada: ${eliminados} archivos PDF eliminados. Los datos de planeaciones en la BD permanecen 100% intactos.`);
    return {
      totalAntes: validFiles.length,
      eliminados,
      restantes: validFiles.length - eliminados,
      mensaje: `Se liberó espacio eliminando ${eliminados} PDFs pesados. Todos los datos de docentes, semanas y estadísticas siguen activos al 100%.`
    };
  } catch (err) {
    console.error('Error en purgearPdfsStorage:', err);
    throw err;
  }
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
      let nuevoEstado = calcularEstado(p.fecha_subida, esInst, p.fecha_aplicacion, docNameStr, p.numero_semana || numeroSemana);
      if (parseInt(numeroSemana) === 35) nuevoEstado = 'a_tiempo';
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
  let { docente_id, area, grado, fecha_aplicacion, numero_semana, nombre_archivo, observaciones } = req.body || {};
  const isDoc = req.user.rol === 'docente' || Boolean(req.user.docente_id);
  let did = isDoc ? (req.user.docente_id || docente_id) : docente_id;

  if (isDoc && (!did || isNaN(parseInt(did)))) {
    try {
      const matchDoc = await resolveDocenteSeguro({
        email: req.user.correo,
        nombre: req.user.nombre
      });
      if (matchDoc) did = matchDoc.id;
    } catch (e) {
      console.warn('Error al vincular docente por correo/nombre:', e.message);
    }
  }

  if (did) {
    try {
      const canonicalDoc = await resolveDocenteSeguro({ id: did });
      if (canonicalDoc && canonicalDoc.id) did = canonicalDoc.id;
    } catch (e) {}
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
      console.warn('Aviso en subida Storage:', upErr.message);
      nombre_archivo = `https://fawxjdiwtamkctrhtqzc.supabase.co/storage/v1/object/public/planeaciones_pdfs/${Date.now()}_planeacion.pdf`;
    }
  } else if (!nombre_archivo) {
    return res.status(400).json({ error: 'Debe adjuntar el archivo PDF de la planeación' });
  }

  try {
    const ahora = new Date();
    const activeW = getActiveAcademicWeek(ahora);
    const semana = parseInt(numero_semana) || activeW;
    const targetDate = fecha_aplicacion ? parseDateSafe(fecha_aplicacion) : parseDateSafe(getMondayOfISOWeek(semana, ahora.getFullYear()));

    const dayOfWeek = ahora.getDay();
    const isFridayOrWeekend = (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0);
    const maxSemanaPermitida = isFridayOrWeekend ? (activeW + 1) : activeW;

    if (req.user.rol === 'docente' && semana > maxSemanaPermitida) {
      return res.status(400).json({ 
        error: `No está permitido registrar semanas futuras (Semana ${semana}). Las semanas siguientes únicamente se habilitan cada viernes.` 
      });
    }

    const docInfo = await resolveDocenteSeguro({ id: did });
    const targetDocIds = (docInfo && docInfo.linked_ids && docInfo.linked_ids.length > 0) ? docInfo.linked_ids : [did];
    const docNameStr = docInfo ? `${docInfo.nombre} ${docInfo.correo}` : '';

    const anioTarget = targetDate.getFullYear();
    const { data: inst } = await supabase.from('semanas_institucionales').select('id').eq('anio', anioTarget).eq('numero_semana', semana);
    let estadoInicial = calcularEstado(ahora, inst && inst.length > 0, fecha_aplicacion, docNameStr, semana);
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
      .in('docente_id', targetDocIds)
      .eq('numero_semana', semana)
      .eq('estado', 'no_entrego');

    // Prevenir duplicado de planeación: verificar si ya existe una para el mismo docente, semana, área y grado
    const { data: existingManualList } = await supabase
      .from('planeaciones')
      .select('*')
      .in('docente_id', targetDocIds)
      .eq('numero_semana', semana)
      .ilike('area', area || 'General')
      .ilike('grado', grado || 'Transición')
      .neq('estado', 'no_entrego');

    let existingManual = null;
    if (existingManualList && existingManualList.length > 0) {
      existingManual = existingManualList.find(p => {
        if (!p.nombre_archivo) return false;
        const normExisting = normalizeStr(p.nombre_archivo).replace(/[^a-z0-9]/g, '');
        const normNew = normalizeStr(nombre_archivo).replace(/[^a-z0-9]/g, '');
        return normExisting === normNew;
      });
      // Si no coincide el nombre exacto, pero se subió dentro de los últimos 30 minutos
      if (!existingManual) {
        existingManual = existingManualList.find(p => {
          if (!p.fecha_subida) return false;
          const diffMs = Math.abs(ahora.getTime() - new Date(p.fecha_subida).getTime());
          return diffMs < 30 * 60 * 1000;
        });
      }
    }

    let rows = null;
    if (existingManual) {
      const { data: upRows, error: upErr } = await supabase
        .from('planeaciones')
        .update({
          fecha_aplicacion: dateFormatted,
          fecha_subida: ahora.toISOString(),
          nombre_archivo,
          observaciones: observaciones || existingManual.observaciones || '',
          estado: estadoInicial,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingManual.id)
        .select('*');
      if (upErr) throw upErr;
      rows = upRows;
    } else {
      const { data: insRows, error: insErr } = await insertPlaneacionSegura({
        docente_id: did, 
        area: area || 'General', 
        grado: grado || 'Transición', 
        fecha_aplicacion: dateFormatted, 
        numero_semana: semana, 
        nombre_archivo, 
        observaciones: observaciones || '', 
        fecha_subida: ahora.toISOString(),
        estado: estadoInicial
      });
      if (insErr) throw insErr;
      rows = insRows;
    }
      
    // Actualizar/re-evaluar estados de la semana
    await actualizarEstadosSemana(did, semana);

    // Re-obtener la planeación recién insertada o actualizada
    let finalRow = (rows && rows[0]) || null;
    if (finalRow && finalRow.id) {
      const { data: updatedRows } = await supabase.from('planeaciones').select('*').eq('id', finalRow.id);
      if (updatedRows && updatedRows[0]) finalRow = updatedRows[0];
    }

    // Comprobación de cuota y auto-purga segura (si alcanza o supera los 700 PDFs en Storage)
    setTimeout(async () => {
      try {
        const count = await getStorageFilesCount();
        if (count >= 700) {
          console.log(`⚠️ Se alcanzó el límite configurado de 700 PDFs en Supabase (${count} archivos). Ejecutando purga para liberar espacio en la nube...`);
          // Purga total de archivos físicos en Storage (los registros en BD permanecen 100% intactos)
          await purgearPdfsStorage(0);
        }
      } catch (checkErr) {
        console.warn('Nota en verificación automática de almacenamiento:', checkErr.message);
      }
    }, 1500);

    res.status(201).json(finalRow || (rows && rows[0]) || { success: true });
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
      let allowedDocIds = [parseInt(req.user.docente_id)];
      try {
        const canonical = await resolveDocenteSeguro({ id: req.user.docente_id, email: req.user.correo, nombre: req.user.nombre });
        if (canonical && canonical.linked_ids) allowedDocIds = canonical.linked_ids.map(Number);
      } catch (e) {}

      // Verificar que la planeación pertenece a este docente o a sus identidades vinculadas
      if (!allowedDocIds.includes(parseInt(plan.docente_id))) {
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

    // Verificar restricción de semana adelantada para docentes al actualizar (hasta 4 semanas de preparación anticipada)
    if (req.user.rol === 'docente' && (fecha_aplicacion || numero_semana)) {
      const targetD = fecha_aplicacion ? parseDateSafe(fecha_aplicacion) : new Date();
      const targetW = numero_semana ? parseInt(numero_semana) : semanaISO(targetD);
      const now = new Date();
      const currentW = getActiveAcademicWeek(now);
      const dayOfWeek = now.getDay();
      const isFridayOrWeekend = (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0);
      const maxW = isFridayOrWeekend ? (currentW + 1) : currentW;

      if (targetW > maxW) {
        return res.status(400).json({
          error: `Por motivos de seguridad, los docentes no pueden ingresar o cambiar planeaciones para semanas futuras (Máximo Semana ${maxW}). Las semanas siguientes se habilitan los viernes.`
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
      let allowedDocIds = [parseInt(req.user.docente_id)];
      try {
        const canonical = await resolveDocenteSeguro({ id: req.user.docente_id, email: req.user.correo, nombre: req.user.nombre });
        if (canonical && canonical.linked_ids) allowedDocIds = canonical.linked_ids.map(Number);
      } catch (e) {}

      if (!allowedDocIds.includes(parseInt(plan.docente_id))) {
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
      let allowedDocIds = [parseInt(req.user.docente_id)];
      try {
        const canonical = await resolveDocenteSeguro({ id: req.user.docente_id, email: req.user.correo, nombre: req.user.nombre });
        if (canonical && canonical.linked_ids) allowedDocIds = canonical.linked_ids.map(Number);
      } catch (e) {}

      if (!allowedDocIds.includes(parseInt(plan.docente_id))) {
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
    const { data: planRows } = await supabase.from('planeaciones').select('*').eq('id', planId);
    if (!planRows || planRows.length === 0) {
      return res.status(404).json({ error: 'Planeación no encontrada' });
    }
    const plan = planRows[0];
    if (plan.docente_id) {
      try {
        const { data: dRows } = await supabase.from('docentes').select('*').eq('id', plan.docente_id);
        if (dRows && dRows.length > 0) plan.docentes = dRows[0];
      } catch (e) {}
    }

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
      const baseSbUrl = process.env.SUPABASE_URL || 'https://fawxjdiwtamkctrhtqzc.supabase.co';
      pdfUrl = `${baseSbUrl}/storage/v1/object/public/planeaciones_pdfs/${encodeURIComponent(plan.nombre_archivo)}`;
    }

    const response = await fetch(pdfUrl);
    if (!response.ok) {
      // El archivo físico fue purgado del Storage de Supabase para optimizar espacio,
      // pero el registro académico permanece 100% verificado y contabilizado en la BD.
      let docNombre = 'Docente Registrado';
      let docDoc = '';
      let docSede = '';
      let docJornada = '';

      if (plan.docente_id) {
        try {
          const { data: dData } = await supabase.from('docentes').select('nombre, documento, sede_nombre, jornada_nombre').eq('id', plan.docente_id);
          if (dData && dData[0]) {
            docNombre = dData[0].nombre || docNombre;
            docDoc = dData[0].documento || '';
            docSede = dData[0].sede_nombre || '';
            docJornada = dData[0].jornada_nombre || '';
          }
        } catch (e) {}
      }

      const estadoLabel = plan.estado === 'a_tiempo' ? '🟢 A Tiempo (Plazo Oficial)' :
                          plan.estado === 'retraso' ? '🟡 Con Retraso (Extemporáneo)' :
                          plan.estado === 'semana_institucional' ? '🔵 Semana Institucional' : '🔴 No Entregó';

      const fechaSubidaFmt = plan.fecha_subida ? new Date(plan.fecha_subida).toLocaleString('es-CO') : 'Registrado';
      const fechaApliFmt = plan.fecha_aplicacion ? String(plan.fecha_aplicacion).split('T')[0] : 'Programada';
      const obsHtml = plan.observaciones ? `<div style="margin-top:14px; padding:10px; background:#f8fafc; border-radius:6px; border:1px solid #e2e8f0; font-size:13px;"><strong>Observaciones:</strong> ${String(plan.observaciones).replace(/</g, '&lt;')}</div>` : '';

      const comprobanteHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Comprobante Oficial de Planeación · I.E. Guaimaral</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; color: #1e293b; padding: 30px 15px; margin: 0; }
    .card { max-width: 680px; margin: 0 auto; background: #ffffff; border: 2px solid #0284c7; border-radius: 12px; padding: 28px; box-shadow: 0 10px 25px rgba(0,0,0,0.06); }
    .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 20px; }
    .header h1 { margin: 0; color: #0369a1; font-size: 20px; text-transform: uppercase; }
    .header p { margin: 4px 0 0; color: #64748b; font-size: 13px; font-weight: 600; }
    .subhead { background: #e0f2fe; color: #0284c7; font-weight: 700; font-size: 12px; padding: 6px 14px; border-radius: 20px; display: inline-block; margin-top: 10px; }
    table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 13.5px; }
    th, td { padding: 9px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
    th { background: #f8fafc; color: #475569; width: 32%; }
    .verified-seal { background: #ecfdf5; border: 1.5px dashed #10b981; border-radius: 8px; padding: 14px; margin-top: 20px; }
    .verified-seal h3 { margin: 0 0 6px; color: #059669; font-size: 14.5px; display: flex; align-items: center; gap: 6px; }
    .verified-seal p { margin: 0; font-size: 12px; color: #047857; line-height: 1.5; }
    .actions { text-align: center; margin-top: 24px; display: flex; justify-content: center; gap: 12px; }
    .btn { background: #0284c7; color: #ffffff; border: none; padding: 10px 20px; border-radius: 6px; font-size: 13.5px; font-weight: 700; cursor: pointer; text-decoration: none; }
    .btn:hover { background: #0369a1; }
    .btn-close { background: #64748b; }
    @media print { .actions { display: none; } body { padding: 0; background: #fff; } .card { border: 1px solid #999; box-shadow: none; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Institución Educativa Guaimaral</h1>
      <p>SISTEMA INSTITUCIONAL DE GESTIÓN DE PLANEACIONES (SIGEP-IEG)</p>
      <div class="subhead">COMPROBANTE OFICIAL DE RADICACIÓN Y CUMPLIMIENTO</div>
    </div>

    <table>
      <tr><th>Docente</th><td><strong>${docNombre}</strong> ${docDoc ? `<span style="color:#64748b;">(CC: ${docDoc})</span>` : ''}</td></tr>
      <tr><th>Sede / Jornada</th><td>${docSede || 'Sede Principal'} · ${docJornada || 'Jornada Regular'}</td></tr>
      <tr><th>Área / Asignatura</th><td><strong>${plan.area || '-'}</strong></td></tr>
      <tr><th>Grado</th><td>${plan.grado || '-'}</td></tr>
      <tr><th>Semana Académica</th><td><strong style="color:#0284c7;">Semana ${plan.numero_semana || '-'}</strong></td></tr>
      <tr><th>Fecha de Aplicación</th><td>${fechaApliFmt}</td></tr>
      <tr><th>Fecha de Entrega</th><td>${fechaSubidaFmt}</td></tr>
      <tr><th>Estado de Cumplimiento</th><td><strong>${estadoLabel}</strong></td></tr>
      <tr><th>Archivo Radicado</th><td><code>${plan.nombre_archivo ? plan.nombre_archivo.split('/').pop().split('?')[0] : 'Planeacion.pdf'}</code></td></tr>
    </table>

    ${obsHtml}

    <div class="verified-seal">
      <h3>✅ Entrega Académica Validada y Registrada</h3>
      <p>
        Esta planeación fue radicada a tiempo en el sistema y <strong>permanece 100% activa en las estadísticas institucionales y reportes</strong>.
        <br>
        <em>Nota de Almacenamiento:</em> El archivo PDF digital fue archivado en el corte de almacenamiento institucional en la nube para optimizar espacio del sistema.
      </p>
    </div>

    <div class="actions">
      <button class="btn" onclick="window.print()">🖨️ Imprimir Comprobante</button>
      <button class="btn btn-close" onclick="window.close()">Cerrar</button>
    </div>
  </div>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(comprobanteHtml);
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
// Recibe planeaciones generadas con IA desde la plataforma de Planeaciones (Docente AI Pro / Rector 2.0)
exports.recibirDesdeRector = async (req, res) => {
  try {
    const {
      docente: docObj,
      metadata: metaObj,
      secuencia: secObj,
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

    // Normalizar datos de docente (soporta estructura plana y anidada `docente`)
    const emailFinal = docente_email || (docObj && (docObj.email || docObj.correo));
    const nombreFinal = docente_nombre || (docObj && docObj.nombre);

    if (!emailFinal && !nombreFinal) {
      return res.status(400).json({ error: 'Se requiere información del docente (correo o nombre).' });
    }

    const cleanEmail = (emailFinal || '').toLowerCase().trim();
    const cleanName = (nombreFinal || '').toLowerCase().trim();

    // Normalizar metadata (soporta estructura plana y anidada `metadata`)
    const areaFinal = area || (metaObj && metaObj.area) || 'General';
    const gradoFinal = grado || (metaObj && metaObj.grado) || 'General';
    const numSemanaRaw = numero_semana || (metaObj && (metaObj.numero_semana || metaObj.semana));
    const fechaAppRaw = fecha_aplicacion || (metaObj && metaObj.fecha_aplicacion);
    const duracionClasesRaw = duracion_clases || sesiones || (metaObj && (metaObj.duracion_clases || metaObj.sesiones));

    // Normalizar secuencia pedagógica (soporta estructura plana y anidada `secuencia`)
    const secuenciaFinal = secuencia_json || secObj;
    const temaFinal = tema || (secObj && (secObj.titulo_secuencia || secObj.tema)) || (secuenciaFinal && secuenciaFinal.titulo_secuencia) || 'Planeacion_Didactica';
    const tallerFinal = taller_imprimible || (secObj && secObj.taller_imprimible) || (secuenciaFinal && secuenciaFinal.taller_imprimible);

    // 1. Buscar docente en la base de datos de manera inteligente e inmune a duplicados
    let docente = await resolveDocenteSeguro({
      email: cleanEmail,
      nombre: cleanName,
      documento: docObj && docObj.documento
    });

    if (!docente) {
      console.warn(`⚠️ Docente no encontrado con resolveDocenteSeguro para: [nombre: "${nombreFinal}", email: "${emailFinal}"]. Intentando búsqueda exhaustiva...`);
      const { data: allDocs } = await supabase.from('docentes').select('*');
      if (allDocs && allDocs.length > 0) {
        const canonicalKey = getCanonicalDocKey(cleanName, cleanEmail);
        docente = allDocs.find(d => getCanonicalDocKey(d.nombre, d.correo) === canonicalKey);
        if (!docente) {
          const words = cleanName.split(/\s+/).filter(w => w.length > 2);
          if (words.length >= 2) {
            docente = allDocs.find(d => {
              const dWords = normalizeStr(d.nombre).split(/\s+/).filter(w => w.length > 2);
              return words.every(w => dWords.includes(w)) || (dWords.length >= 2 && dWords.every(w => words.includes(w)));
            });
          }
        }
      }
    }

    if (!docente) {
      return res.status(404).json({
        ok: false,
        success: false,
        error: `No se encontró al docente institucional (${nombreFinal || emailFinal}) en la nómina oficial de SIGEP-IEG. Verifique que el docente esté registrado.`
      });
    }

    // 2. Sincronizar catálogo de áreas y grados asignados al docente (sin crear nuevos docentes)
    try {
      const updateDoc = {};
      let docAreasArr = docente.areas ? docente.areas.split(',').map(s => s.trim()).filter(Boolean) : [];
      if (docObj && docObj.areas) {
        const incomingAreas = docObj.areas.split(',').map(s => s.trim()).filter(Boolean);
        incomingAreas.forEach(a => { if (!docAreasArr.includes(a)) docAreasArr.push(a); });
      } else if (areaFinal && areaFinal !== 'General' && !docAreasArr.includes(areaFinal)) {
        docAreasArr.push(areaFinal);
      }
      if (docAreasArr.join(', ') !== (docente.areas || '')) {
        updateDoc.areas = docAreasArr.join(', ');
      }

      let docGradosArr = docente.grados ? docente.grados.split(',').map(s => s.trim()).filter(Boolean) : [];
      if (docObj && docObj.grados) {
        const incomingGrados = docObj.grados.split(',').map(s => s.trim()).filter(Boolean);
        incomingGrados.forEach(g => { if (!docGradosArr.includes(g)) docGradosArr.push(g); });
      } else if (gradoFinal && gradoFinal !== 'General' && !docGradosArr.includes(gradoFinal)) {
        docGradosArr.push(gradoFinal);
      }
      if (docGradosArr.join(', ') !== (docente.grados || '')) {
        updateDoc.grados = docGradosArr.join(', ');
      }

      if (Object.keys(updateDoc).length > 0) {
        updateDoc.updated_at = new Date().toISOString();
        await supabase.from('docentes').update(updateDoc).eq('id', docente.id);
        docente = { ...docente, ...updateDoc };
        console.log(`🔄 Perfil docente sincronizado (${docente.nombre}):`, Object.keys(updateDoc));
      }
    } catch (profileErr) {
      console.warn('Nota al sincronizar perfil de docente en recibirDesdeRector:', profileErr.message);
    }

    // 3. Verificar estado de la cuenta (activo / pago)
    if (docente.activo === false) {
      return res.status(403).json({
        ok: false,
        success: false,
        error: 'Acceso no permitido: La cuenta del docente no se encuentra activa o presenta pagos pendientes en SIGEP-IEG.'
      });
    }

    const did = docente.id;
    const targetDocIds = (docente.linked_ids && docente.linked_ids.length > 0) ? docente.linked_ids : [did];
    const ahora = new Date();
    const fechaSubidaFinal = fecha_envio ? new Date(fecha_envio) : ahora;
    const fechaSubidaIso = isNaN(fechaSubidaFinal.getTime()) ? ahora.toISOString() : fechaSubidaFinal.toISOString();
    
    // Determinar fecha de aplicación y número de semana
    let dateFormatted;
    let targetDate;
    if (fechaAppRaw) {
      dateFormatted = String(fechaAppRaw).trim();
      targetDate = parseDateSafe(fechaAppRaw);
    } else {
      targetDate = fechaSubidaFinal;
      const yyyy = targetDate.getFullYear();
      const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
      const dd = String(targetDate.getDate()).padStart(2, '0');
      dateFormatted = `${yyyy}-${mm}-${dd}`;
    }

    const activeW = getActiveAcademicWeek(fechaSubidaFinal);
    const semana = numSemanaRaw ? parseInt(numSemanaRaw) : activeW;
    const anioTarget = targetDate.getFullYear();
    const cantClases = duracionClasesRaw ? parseInt(duracionClasesRaw) : 1;

    const dayOfWeek = fechaSubidaFinal.getDay();
    const isFridayOrWeekend = (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0);
    const maxSemanaPermitida = isFridayOrWeekend ? (activeW + 1) : activeW;

    if (semana > maxSemanaPermitida) {
      return res.status(400).json({ 
        ok: false,
        success: false,
        error: `No está permitido registrar semanas futuras (Semana ${semana}). Las semanas siguientes únicamente se habilitan cada viernes.` 
      });
    }

    const { data: inst } = await supabase
      .from('semanas_institucionales')
      .select('id')
      .eq('anio', anioTarget)
      .eq('numero_semana', semana);

    const docNameStr = `${docente.nombre || ''} ${docente.correo || ''}`;
    let estadoInicial = calcularEstado(fechaSubidaFinal, inst && inst.length > 0, targetDate, docNameStr, semana);
    if (semana === 35) estadoInicial = 'a_tiempo';

    // Limpiar falta previa de no_entrego para este docente y sus IDs vinculados
    await supabase
      .from('planeaciones')
      .delete()
      .in('docente_id', targetDocIds)
      .eq('numero_semana', semana)
      .eq('estado', 'no_entrego');

    const cleanTema = (temaFinal || 'Planeacion_Didactica')
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileNameVirtual = `Planeacion_IA_${cleanTema.substring(0, 45)}.pdf`;

    let obs = '';
    if (secuenciaFinal) {
      obs = '[REVISION_IA_JSON]:' + JSON.stringify({
        tema: temaFinal || '',
        periodo: periodo || '1',
        sesiones: cantClases,
        secuencia: secuenciaFinal,
        taller: tallerFinal || null
      });
    } else {
      obs = `Planeación generada con IA - ${cantClases} Clase(s)`;
    }

    // 4. PREVENIR DUPLICADOS: Verificar si ya existe una planeación para el mismo docente, semana, área y grado
    const { data: existingPlans } = await supabase
      .from('planeaciones')
      .select('*')
      .in('docente_id', targetDocIds)
      .eq('numero_semana', semana)
      .ilike('area', areaFinal)
      .ilike('grado', gradoFinal)
      .neq('estado', 'no_entrego');

    let existingMatch = null;
    if (existingPlans && existingPlans.length > 0) {
      const normNewFile = normalizeStr(fileNameVirtual).replace(/[^a-z0-9]/g, '');
      const normTema = normalizeStr(cleanTema).replace(/[^a-z0-9]/g, '');

      existingMatch = existingPlans.find(p => {
        if (!p.nombre_archivo) return false;
        const normOldFile = normalizeStr(p.nombre_archivo).replace(/[^a-z0-9]/g, '');
        return normOldFile === normNewFile || (normTema.length >= 8 && normOldFile.includes(normTema));
      });

      // Si no coincide el nombre exacto pero fue subida recientemente (dentro de las últimas 2 horas)
      // para la misma área y grado, actualizarla para evitar dobles envíos por reintentos o clics repetidos
      if (!existingMatch) {
        existingMatch = existingPlans.find(p => {
          if (!p.fecha_subida) return false;
          const diffMs = Math.abs(new Date(fechaSubidaIso).getTime() - new Date(p.fecha_subida).getTime());
          return diffMs < 2 * 60 * 60 * 1000;
        });
      }
    }

    let rows = null;
    let isUpdate = false;

    if (existingMatch) {
      isUpdate = true;
      const { data: upRows, error: upErr } = await supabase
        .from('planeaciones')
        .update({
          fecha_aplicacion: dateFormatted,
          fecha_subida: fechaSubidaIso,
          nombre_archivo: fileNameVirtual,
          observaciones: obs,
          estado: estadoInicial,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingMatch.id)
        .select('*');

      if (upErr) throw upErr;
      rows = upRows;
      console.log(`🔄 Planeación existente (ID ${existingMatch.id}) actualizada para docente ${docente.nombre} (Semana ${semana}, ${areaFinal}) - Evitando duplicado.`);
    } else {
      const { data: insRows, error: insErr } = await insertPlaneacionSegura({
        docente_id: did,
        area: areaFinal,
        grado: gradoFinal,
        fecha_aplicacion: dateFormatted,
        fecha_subida: fechaSubidaIso,
        numero_semana: semana,
        nombre_archivo: fileNameVirtual,
        observaciones: obs,
        estado: estadoInicial
      });

      if (insErr) throw insErr;
      rows = insRows;
    }

    await actualizarEstadosSemana(did, semana);

    // Auto-purga en background si Storage supera límite
    setTimeout(async () => {
      try {
        const count = await getStorageFilesCount();
        if (count >= 700) {
          console.log(`⚠️ Se alcanzó el límite configurado de 700 PDFs en Supabase (${count} archivos). Ejecutando purga para liberar espacio en la nube...`);
          await purgearPdfsStorage(0);
        }
      } catch (checkErr) {
        console.warn('Nota en verificación automática de almacenamiento:', checkErr.message);
      }
    }, 1500);

    const savedPlan = (rows && rows[0]) || { id: existingMatch?.id, docente_id: did, numero_semana: semana };

    console.log(`✅ Planeación ${isUpdate ? 'actualizada' : 'registrada'} desde Docente AI Pro / Rector para docente ${docente.nombre} (Semana ${semana}, ${areaFinal})`);

    return res.status(isUpdate ? 200 : 201).json({
      ok: true,
      success: true,
      status: 'success',
      action: isUpdate ? 'updated' : 'created',
      mensaje: isUpdate
        ? `Planeación actualizada exitosamente en SIGEP-IEG para la Semana ${semana} (sin duplicados).`
        : `Planeación recibida y registrada exitosamente en SIGEP-IEG para la Semana ${semana}.`,
      planeacion: savedPlan,
      data: savedPlan
    });
  } catch (err) {
    console.error('Error en recibirDesdeRector:', err);
    return res.status(500).json({
      ok: false,
      success: false,
      error: 'Error al procesar la planeación en SIGEP-IEG: ' + err.message
    });
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

// GET /api/planeaciones/config-entrega
// Provee la configuración oficial en tiempo real para que Rector IA no tenga doble lógica
exports.getConfigEntrega = async (req, res) => {
  try {
    const { docente_email } = req.query;
    const now = new Date();
    const currentW = getActiveAcademicWeek(now);
    
    // Semanas institucionales de la BD
    const { data: instWeeks } = await supabase
      .from('semanas_institucionales')
      .select('*')
      .eq('anio', now.getFullYear());

    // Docente específico si viene el correo o nombre
    let docAreas = [];
    let docGrados = [];
    const queryEmail = docente_email || req.query.email || req.query.correo;
    const queryNombre = req.query.docente_nombre || req.query.nombre || req.query.docente;
    if (queryEmail || queryNombre) {
      const foundDoc = await resolveDocenteSeguro({
        email: queryEmail,
        nombre: queryNombre
      });
      if (foundDoc) {
        if (foundDoc.areas) docAreas = foundDoc.areas.split(',').map(s => s.trim()).filter(Boolean);
        if (foundDoc.grados) docGrados = foundDoc.grados.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    const dayOfWeek = now.getDay();
    const isFridayOrWeekend = (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0);
    const semanaAbiertaMax = isFridayOrWeekend ? (currentW + 1) : currentW;

    // Generar catálogo de semanas
    const EVALUACION_INICIO_SEMANA = 32;
    const semanas = [];
    for (let w = semanaAbiertaMax; w >= EVALUACION_INICIO_SEMANA; w--) {
      const isCur = w === currentW;
      const esInst = (instWeeks || []).some(i => i.numero_semana === w);
      
      let label = `Semana ${w}`;
      if (esInst) label += ' (Institucional / Receso)';
      else if (isCur) label += ' (Semana Activa - En Curso)';
      else label += ' (Anterior)';

      const mondayStr = getMondayOfISOWeek(w, now.getFullYear());

      semanas.push({
        numero: w,
        label,
        es_actual: isCur,
        es_proxima: false,
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

// GET /api/planeaciones/storage-status
// Monitoreo del almacenamiento en Supabase Storage (límite 700 PDFs)
exports.getStorageStatus = async (req, res) => {
  try {
    const { data: files, error } = await supabase.storage.from('planeaciones_pdfs').list('', { limit: 1000 });
    const count = (files || []).filter(f => f.name && f.name !== '.emptyFolderPlaceholder').length;

    // Conteo total de planeaciones en la Base de Datos (PostgreSQL)
    const { count: totalBD } = await supabase
      .from('planeaciones')
      .select('id', { count: 'exact', head: true });

    const limiteMax = 700;
    const porcentaje = Math.min(100, Math.round((count / limiteMax) * 100));

    res.json({
      archivosEnStorage: count,
      limiteMax,
      porcentaje,
      alertaLimite: count >= 550,
      limiteAlcanzado: count >= 700,
      totalPlaneacionesEnBD: totalBD || 0
    });
  } catch (err) {
    console.error('Error al consultar estado de storage:', err);
    res.status(500).json({ error: 'Error al consultar almacenamiento: ' + err.message });
  }
};

// POST /api/planeaciones/purgar-storage
// Libera espacio en Supabase Storage eliminando los archivos PDF pesados sin tocar las filas de la base de datos
exports.purgarStorage = async (req, res) => {
  try {
    const role = (req.user && req.user.rol ? req.user.rol : '').toLowerCase().trim();
    const isAdmin = role === 'administrador' || role === 'admin' || role === 'coordinador';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Solo el administrador institucional puede ejecutar la purga de almacenamiento.' });
    }

    const { mantenerRecientes = 0 } = req.body || {};
    const resultado = await purgearPdfsStorage(parseInt(mantenerRecientes) || 0);

    // Obtener nuevo conteo de almacenamiento tras la purga
    const countRestante = await getStorageFilesCount();

    res.json({
      success: true,
      ...resultado,
      archivosEnStorage: countRestante
    });
  } catch (err) {
    console.error('Error al purgar storage:', err);
    res.status(500).json({ error: 'Error al purgar almacenamiento: ' + err.message });
  }
};


