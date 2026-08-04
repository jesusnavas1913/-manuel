const { supabase, SEDES_MAP, JORNADAS_MAP } = require('../db');
const bcrypt = require('bcryptjs');

// GET /api/docentes
exports.getAll = async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from('docentes')
      .select('*')
      .order('nombre', { ascending: true });
      
    if (error) throw error;
    
    const mapped = (rows || []).map(d => ({
      ...d,
      clave_inicial: d.clave_inicial || 'admin123',
      sede_nombre: SEDES_MAP[d.sede_id] || null,
      jornada_nombre: JORNADAS_MAP[d.jornada_id] || null
    }));
    
    res.json(mapped);
  } catch (err) {
    console.error('Error al obtener docentes:', err);
    res.status(500).json({ error: 'Error al obtener la lista de docentes' });
  }
};

// GET /api/docentes/:id
exports.getOne = async (req, res) => {
  try {
    const { data: rows, error } = await supabase
      .from('docentes')
      .select('*')
      .eq('id', parseInt(req.params.id));
      
    if (error) throw error;
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Docente no encontrado' });
    
    const d = rows[0];
    d.clave_inicial = d.clave_inicial || 'admin123';
    d.sede_nombre = SEDES_MAP[d.sede_id] || null;
    d.jornada_nombre = JORNADAS_MAP[d.jornada_id] || null;
    
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
  const { data, error } = await supabase.from('sedes').select('*').eq('activa', true).order('nombre');
  res.json(data || []);
};

// GET /api/jornadas
exports.getJornadas = async (req, res) => {
  const { data, error } = await supabase.from('jornadas').select('*').order('nombre');
  res.json(data || []);
};
