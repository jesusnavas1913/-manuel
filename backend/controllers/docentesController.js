const { supabase, SEDES_MAP, JORNADAS_MAP, DOCENTE_ALIASES, normalizeDocName, getCanonicalDocKey } = require('../db');
const bcrypt = require('bcryptjs');

// GET /api/docentes
exports.getAll = async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from('docentes')
      .select('*')
      .order('nombre', { ascending: true });
      
    if (error) throw error;
    
    // Deduplicación canónica inteligente: unificar registros duplicados del mismo docente
    const canonicalMap = new Map();

    for (const d of (rows || [])) {
      const key = getCanonicalDocKey(d.nombre, d.correo);
      if (!canonicalMap.has(key)) {
        canonicalMap.set(key, {
          ...d,
          clave_inicial: d.clave_inicial || 'admin123',
          sede_nombre: SEDES_MAP[d.sede_id] || null,
          jornada_nombre: JORNADAS_MAP[d.jornada_id] || null,
          linked_ids: [d.id]
        });
      } else {
        const existing = canonicalMap.get(key);
        if (!existing.linked_ids.includes(d.id)) {
          existing.linked_ids.push(d.id);
        }
        
        // Conservar el nombre más completo e institucional
        if ((d.nombre || '').length > (existing.nombre || '').length) {
          existing.nombre = d.nombre;
        }
        if (!existing.correo && d.correo) existing.correo = d.correo;
        if (!existing.documento && d.documento) existing.documento = d.documento;
        if (!existing.sede_id && d.sede_id) {
          existing.sede_id = d.sede_id;
          existing.sede_nombre = SEDES_MAP[d.sede_id] || existing.sede_nombre;
        }
        if (!existing.jornada_id && d.jornada_id) {
          existing.jornada_id = d.jornada_id;
          existing.jornada_nombre = JORNADAS_MAP[d.jornada_id] || existing.jornada_nombre;
        }

        // Combinar áreas curriculares sin duplicados
        const allAreas = new Set([
          ...(existing.areas ? existing.areas.split(/[,;]+/).map(s => s.trim()).filter(Boolean) : []),
          ...(d.areas ? d.areas.split(/[,;]+/).map(s => s.trim()).filter(Boolean) : [])
        ]);
        if (allAreas.size > 0) existing.areas = Array.from(allAreas).join(', ');

        // Combinar grados académicos sin duplicados
        const allGrados = new Set([
          ...(existing.grados ? existing.grados.split(/[,;]+/).map(s => s.trim()).filter(Boolean) : []),
          ...(d.grados ? d.grados.split(/[,;]+/).map(s => s.trim()).filter(Boolean) : [])
        ]);
        if (allGrados.size > 0) existing.grados = Array.from(allGrados).join(', ');
      }
    }

    const deduplicated = Array.from(canonicalMap.values());
    res.json(deduplicated);
  } catch (err) {
    console.error('Error al obtener docentes:', err);
    res.status(500).json({ error: err.message || 'Error al obtener la lista de docentes' });
  }
};

// GET /api/docentes/:id
exports.getOne = async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const { data: rows, error } = await supabase
      .from('docentes')
      .select('*');
      
    if (error) throw error;
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Docente no encontrado' });
    
    // Buscar directamente por ID o por coincidencia de alias
    let d = rows.find(r => r.id === targetId);
    if (!d) return res.status(404).json({ error: 'Docente no encontrado' });

    const key = getCanonicalDocKey(d.nombre, d.correo);
    const related = rows.filter(r => getCanonicalDocKey(r.nombre, r.correo) === key);
    const linkedIds = related.map(r => r.id);

    // Combinar áreas y grados
    const allAreas = new Set();
    const allGrados = new Set();
    related.forEach(r => {
      if (r.areas) r.areas.split(/[,;]+/).map(s => s.trim()).filter(Boolean).forEach(a => allAreas.add(a));
      if (r.grados) r.grados.split(/[,;]+/).map(s => s.trim()).filter(Boolean).forEach(g => allGrados.add(g));
    });

    d.clave_inicial = d.clave_inicial || 'admin123';
    d.sede_nombre = SEDES_MAP[d.sede_id] || null;
    d.jornada_nombre = JORNADAS_MAP[d.jornada_id] || null;
    d.linked_ids = linkedIds;
    if (allAreas.size > 0) d.areas = Array.from(allAreas).join(', ');
    if (allGrados.size > 0) d.grados = Array.from(allGrados).join(', ');
    
    res.json(d);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
};

// POST /api/docentes
exports.create = async (req, res) => {
  if (req.user.rol !== 'administrador')
    return res.status(403).json({ error: 'Sin permisos' });

  const { nombre, documento, correo, sede_id, jornada_id, areas, grados, password } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });

  const initialKey = password || 'admin123';

  try {
    const payload = {
      nombre, 
      documento: documento || null, 
      correo: correo || null, 
      sede_id: sede_id ? parseInt(sede_id) : null, 
      jornada_id: jornada_id ? parseInt(jornada_id) : null, 
      areas: areas || null, 
      grados: grados || null,
      clave_inicial: initialKey
    };

    // ── Validación de unicidad estricta contra duplicados ──────
    const { data: todosDocentes } = await supabase.from('docentes').select('id, nombre, correo, documento');
    if (todosDocentes && todosDocentes.length > 0) {
      const normNuevoNom = normalizeDocName(nombre);
      const canonicalNuevo = getCanonicalDocKey(nombre, correo);
      const normNuevoMail = correo ? String(correo).toLowerCase().trim() : '';
      const emailUserNuevo = normNuevoMail ? normNuevoMail.split('@')[0].replace(/[._-]/g, '') : '';
      const tokensNuevo = normNuevoNom.split(/\s+/).filter(w => w.length > 2);

      for (const d of todosDocentes) {
        const normExistNom = normalizeDocName(d.nombre);
        const canonicalExist = getCanonicalDocKey(d.nombre, d.correo);
        const normExistMail = d.correo ? String(d.correo).toLowerCase().trim() : '';
        const emailUserExist = normExistMail ? normExistMail.split('@')[0].replace(/[._-]/g, '') : '';

        // Coincidencia canónica institucional
        if (canonicalNuevo && canonicalExist && canonicalNuevo === canonicalExist) {
          return res.status(409).json({ error: `Este docente ya se encuentra registrado institucionalmente como "${d.nombre}". No se permiten registros duplicados.` });
        }

        // Correo exacto
        if (normNuevoMail && normExistMail && normNuevoMail === normExistMail) {
          return res.status(409).json({ error: `Ya existe un docente con el correo "${correo}". No se permiten duplicados.` });
        }

        // Mismo usuario de correo en sedes distintas (evita duplicar docentes por sede)
        if (emailUserNuevo && emailUserExist && emailUserNuevo === emailUserExist && emailUserNuevo.length > 3) {
          return res.status(409).json({ error: `El docente ya está registrado con el usuario "${d.correo}" (${d.nombre}). No se permiten duplicados entre subsedes.` });
        }

        // Documento de identidad
        if (documento && d.documento && String(d.documento).trim() === String(documento).trim()) {
          return res.status(409).json({ error: `Ya existe un docente con el documento "${documento}". No se permiten duplicados.` });
        }

        // Nombre normalizado idéntico
        if (normExistNom === normNuevoNom) {
          return res.status(409).json({ error: `Ya existe un docente registrado con el nombre "${d.nombre}". No se permiten duplicados.` });
        }

        // Coincidencia bidireccional de tokens
        const tokensExist = normExistNom.split(/\s+/).filter(w => w.length > 2);
        const newSubsetOfExist = tokensNuevo.length >= 2 && tokensNuevo.every(t => tokensExist.includes(t));
        const existSubsetOfNew = tokensExist.length >= 2 && tokensExist.every(t => tokensNuevo.includes(t));
        if (newSubsetOfExist || existSubsetOfNew) {
          return res.status(409).json({ error: `Este docente ya se encuentra registrado institucionalmente como "${d.nombre}". No se permiten registros duplicados.` });
        }
      }
    }

    let rows = null;
    let error = null;

    const res1 = await supabase.from('docentes').insert([payload]).select('*');
    if (res1.error && res1.error.message && res1.error.message.includes('clave_inicial')) {
      delete payload.clave_inicial;
      const res2 = await supabase.from('docentes').insert([payload]).select('*');
      rows = res2.data;
      error = res2.error;
    } else {
      rows = res1.data;
      error = res1.error;
    }

    if (error) throw error;
    const docente = rows[0];

    // Sincronizar en tabla usuarios
    const loginIdentifier = (correo || documento || `docente_${docente.id}`).toString().toLowerCase().trim();
    const hash = await bcrypt.hash(initialKey, 10);
    
    await supabase
      .from('usuarios')
      .upsert([{
        nombre, 
        correo: loginIdentifier, 
        password_hash: hash, 
        rol: 'docente', 
        docente_id: docente.id,
        activo: true
      }], { onConflict: 'correo' });

    res.status(201).json(docente);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Error al crear docente' });
  }
};

// PUT /api/docentes/:id
exports.update = async (req, res) => {
  if (req.user.rol !== 'administrador')
    return res.status(403).json({ error: 'Sin permisos' });

  const docenteId = parseInt(req.params.id);
  const { nombre, documento, correo, sede_id, jornada_id, estado, areas, grados, password } = req.body;

  try {
    const payload = {};
    if (nombre !== undefined) payload.nombre = nombre;
    if (documento !== undefined) payload.documento = documento;
    if (correo !== undefined) payload.correo = correo;
    if (sede_id !== undefined) payload.sede_id = sede_id ? parseInt(sede_id) : null;
    if (jornada_id !== undefined) payload.jornada_id = jornada_id ? parseInt(jornada_id) : null;
    if (estado !== undefined) payload.estado = estado;
    if (areas !== undefined) payload.areas = areas;
    if (grados !== undefined) payload.grados = grados;
    if (password) payload.clave_inicial = password;

    let rows = null;
    let error = null;

    const res1 = await supabase.from('docentes').update(payload).eq('id', docenteId).select('*');
    if (res1.error && res1.error.message && res1.error.message.includes('clave_inicial')) {
      delete payload.clave_inicial;
      const res2 = await supabase.from('docentes').update(payload).eq('id', docenteId).select('*');
      rows = res2.data;
      error = res2.error;
    } else {
      rows = res1.data;
      error = res1.error;
    }

    if (error) throw error;
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Docente no encontrado' });

    const docenteActualizado = rows[0];

    // Sincronizar cuenta de usuario en la tabla usuarios
    const userPayload = {};
    if (nombre !== undefined) userPayload.nombre = nombre;
    if (correo !== undefined && correo) userPayload.correo = correo.toLowerCase().trim();
    if (password) userPayload.password_hash = await bcrypt.hash(password, 10);
    if (estado !== undefined) userPayload.activo = (estado === 'activo');

    if (Object.keys(userPayload).length > 0) {
      await supabase.from('usuarios').update(userPayload).eq('docente_id', docenteId);
      if (docenteActualizado.correo) {
        await supabase.from('usuarios').update(userPayload).ilike('correo', docenteActualizado.correo.toLowerCase().trim());
      }
    }

    res.json(docenteActualizado);
  } catch (err) {
    console.error('Error al actualizar docente:', err);
    res.status(500).json({ error: err.message || 'Error al actualizar docente' });
  }
};

// DELETE /api/docentes/:id
exports.remove = async (req, res) => {
  if (req.user.rol !== 'administrador')
    return res.status(403).json({ error: 'Sin permisos' });

  const docenteId = parseInt(req.params.id);

  try {
    const { data: docData } = await supabase.from('docentes').select('correo').eq('id', docenteId);
    const docenteMail = docData && docData[0] ? docData[0].correo : null;

    await supabase.from('planeaciones').delete().eq('docente_id', docenteId);
    await supabase.from('usuarios').delete().eq('docente_id', docenteId);
    if (docenteMail) {
      await supabase.from('usuarios').delete().ilike('correo', docenteMail.toLowerCase().trim());
    }

    const { data, error } = await supabase.from('docentes').delete().eq('id', docenteId).select();
    if (error) throw error;
    
    res.json({ message: 'Docente, sus planeaciones y usuario de acceso eliminados con éxito' });
  } catch (err) {
    console.error('Error al eliminar docente:', err);
    res.status(500).json({ error: err.message || 'Error al eliminar docente' });
  }
};

// GET /api/sedes
exports.getSedes = async (req, res) => {
  try {
    const { data, error } = await supabase.from('sedes').select('*').eq('activa', true).order('nombre');
    if (data && data.length > 0) return res.json(data);
  } catch(e) {}
  res.json([
    { id: 1, nombre: 'I.E. Guaimaral', activa: true },
    { id: 2, nombre: 'Sede Cuatro Bocas', activa: true },
    { id: 3, nombre: 'Sede Altamira', activa: true }
  ]);
};

// GET /api/jornadas
exports.getJornadas = async (req, res) => {
  try {
    const { data, error } = await supabase.from('jornadas').select('*').order('nombre');
    if (data && data.length > 0) return res.json(data);
  } catch(e) {}
  res.json([
    { id: 1, nombre: 'Mañana' },
    { id: 2, nombre: 'Tarde' },
    { id: 3, nombre: 'Nocturna' }
  ]);
};
