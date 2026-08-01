const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabaseUrl = process.env.SUPABASE_URL || 'https://bulrbsaoxwuibslfhlef.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1bHJic2FveHd1aWJzbGZobGVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMzQwMjEsImV4cCI6MjEwMDkxMDAyMX0.H96a4BefNekS1j2xCL4bFzJ_hmQ021svehz74g0tr34';

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('⚡ Conectado 100% a Supabase API Nube (', supabaseUrl, ')');

// Mapas estáticos en memoria para resolver relaciones en 0ms sin sobrecargar Supabase con Joins
const SEDES_MAP = {
  1: 'I.E. Guaimaral',
  2: 'Sede Cuatro Bocas',
  3: 'Sede Altamira'
};

const JORNADAS_MAP = {
  1: 'Mañana',
  2: 'Tarde',
  3: 'Nocturna'
};

// Mapa en memoria para almacenar claves de docentes de forma transparente
const DOCENTE_KEYS_MAP = {
  7: 'Jesus2026!',
  'jesus.navas@guaimaral.edu.co': 'Jesus2026!'
};

// Sistema de Caché Inteligente en Memoria para Respuesta Ultra-Rápida
const cacheMap = new Map();
const TTL = 3000; // 3 segundos de lectura instantánea (0ms)

function getCache(key) {
  const item = cacheMap.get(key);
  if (!item) return null;
  if (Date.now() - item.time > TTL) {
    cacheMap.delete(key);
    return null;
  }
  return item.val;
}

function setCache(key, val) {
  cacheMap.set(key, { time: Date.now(), val });
}

function invalidateCache() {
  cacheMap.clear();
}

const defaultUsers = [
  {
    id: 1,
    nombre: 'Pedro',
    correo: 'pedro@guaimaral.edu.co',
    password_hash: bcrypt.hashSync('admin123', 10),
    rol: 'administrador',
    docente_id: null,
    activo: true
  },
  {
    id: 2,
    nombre: 'Pedro',
    correo: 'admin@guaimaral.edu.co',
    password_hash: bcrypt.hashSync('admin123', 10),
    rol: 'administrador',
    docente_id: null,
    activo: true
  }
];

// Compatibilidad SQL wrapper enviando peticiones directas a la API Supabase
async function query(text, params = []) {
  const sql = text.trim();
  const lowerSql = sql.toLowerCase();

  const parseId = (val) => {
    if (val === undefined || val === null || val === '' || val === 'undefined' || val === 'null' || isNaN(val)) return null;
    return parseInt(val);
  };

  const isWriteOp = lowerSql.startsWith('insert') || lowerSql.startsWith('update') || lowerSql.startsWith('delete');
  if (isWriteOp) {
    invalidateCache();
  }

  try {
    // 1. AUTH / USUARIOS
    if (lowerSql.includes('from usuarios') && lowerSql.includes('correo =')) {
      const email = params[0] ? params[0].toLowerCase().trim() : '';
      let userList = [];

      try {
        const { data, error } = await supabase.from('usuarios').select('*').eq('correo', email).eq('activo', true);
        if (!error && data && data.length > 0) {
          userList = data;
        }
      } catch (e) {}

      if (userList.length === 0) {
        // 1A. Verificar si existe en la tabla de docentes
        try {
          const { data: docData } = await supabase.from('docentes').select('*').eq('correo', email);
          if (docData && docData.length > 0) {
            const doc = docData[0];
            const pass = doc.clave_inicial || 'admin123';
            const hash = bcrypt.hashSync(pass, 10);
            const { data: newUser } = await supabase.from('usuarios').insert([{
              nombre: doc.nombre,
              correo: email,
              password_hash: hash,
              rol: 'docente',
              docente_id: doc.id,
              activo: true
            }]).select();

            if (newUser && newUser.length > 0) {
              userList = newUser;
            }
          }
        } catch (e) {}
      }

      if (userList.length === 0) {
        const foundDefault = defaultUsers.find(u => u.correo.toLowerCase() === email && u.activo);
        if (foundDefault) userList = [foundDefault];
      }

      return { rows: userList };
    }

    if (lowerSql.includes('from usuarios') && lowerSql.includes('where id =')) {
      const id = parseId(params[0]);
      const { data } = await supabase.from('usuarios').select('*').eq('id', id);
      if (data && data.length > 0) return { rows: data };
      const foundDefault = defaultUsers.find(u => u.id == id);
      return { rows: foundDefault ? [foundDefault] : [] };
    }

    if (lowerSql.includes('insert into usuarios')) {
      const [nombre, correo, password_hash, rol, docente_id] = params;
      const { data, error } = await supabase.from('usuarios').insert([{
        nombre, correo, password_hash, rol, docente_id: docente_id || null, activo: true
      }]).select();
      if (error) throw error;
      return { rows: data || [] };
    }

    if (lowerSql.includes('update usuarios set password_hash')) {
      const hash = params[0];
      let queryBuilder = supabase.from('usuarios').update({ password_hash: hash });

      const docIdMatch = sql.match(/where\s+docente_id\s*=\s*(\d+|\$\d+)/i);
      const idMatch = sql.match(/where\s+id\s*=\s*(\d+|\$\d+)/i);
      const emailMatch = sql.match(/where\s+correo\s*=\s*(\$?\d+|'[^']+'|"[^"]+")/i);

      if (docIdMatch) {
        const valStr = docIdMatch[1];
        const val = valStr.startsWith('$') ? params[parseInt(valStr.substring(1)) - 1] : valStr;
        queryBuilder = queryBuilder.eq('docente_id', parseId(val));
      } else if (emailMatch) {
        const valStr = emailMatch[1];
        const val = valStr.startsWith('$') ? params[parseInt(valStr.substring(1)) - 1] : valStr.replace(/'/g, '');
        queryBuilder = queryBuilder.eq('correo', val);
      } else if (idMatch) {
        const valStr = idMatch[1];
        const val = valStr.startsWith('$') ? params[parseInt(valStr.substring(1)) - 1] : valStr;
        queryBuilder = queryBuilder.eq('id', parseId(val));
      } else if (params.length > 1) {
        queryBuilder = queryBuilder.eq('id', parseId(params[1]));
      }

      const { data, error } = await queryBuilder.select();
      if (error) throw error;
      return { rows: data || [] };
    }

    if (lowerSql.includes('delete from usuarios')) {
      const id = parseId(params[0]);
      const isDocenteId = lowerSql.includes('docente_id');
      const { data, error } = await supabase.from('usuarios').delete().eq(isDocenteId ? 'docente_id' : 'id', id).select();
      if (error) throw error;
      return { rowCount: data ? data.length : 1 };
    }

    // 2. SEDES & JORNADAS (0ms desde memoria local)
    if (lowerSql.includes('from sedes')) {
      const data = [
        { id: 1, nombre: SEDES_MAP[1], activa: true },
        { id: 2, nombre: SEDES_MAP[2], activa: true },
        { id: 3, nombre: SEDES_MAP[3], activa: true }
      ];
      return { rows: data };
    }

    if (lowerSql.includes('from jornadas')) {
      const data = [
        { id: 1, nombre: JORNADAS_MAP[1] },
        { id: 2, nombre: JORNADAS_MAP[2] },
        { id: 3, nombre: JORNADAS_MAP[3] }
      ];
      return { rows: data };
    }

    // 3. REPORTES KPI (Paralelizado con Promise.all)
    if (lowerSql.includes('as total_docentes')) {
      const cacheKey = 'reportes_kpi';
      const cachedData = getCache(cacheKey);
      if (cachedData) return cachedData;

      const [docRes, planRes] = await Promise.all([
        supabase.from('docentes').select('id', { count: 'exact' }).eq('estado', 'activo'),
        supabase.from('planeaciones').select('estado')
      ]);

      const total_docentes = docRes.data ? docRes.data.length : 0;
      const plans = planRes.data || [];
      const a_tiempo = plans.filter(p => p.estado === 'a_tiempo').length;
      const con_retraso = plans.filter(p => p.estado === 'retraso').length;
      const no_entrego = plans.filter(p => p.estado === 'no_entrego').length;
      const semana_institucional = plans.filter(p => p.estado === 'semana_institucional').length;

      const res = {
        rows: [{
          total_docentes,
          a_tiempo,
          con_retraso,
          no_entrego,
          semana_institucional,
          total_planeaciones: plans.length
        }]
      };
      setCache(cacheKey, res);
      return res;
    }

    // 4. DOCENTES
    if (lowerSql.includes('delete from docentes')) {
      const id = parseId(params[0]);
      const { data, error } = await supabase.from('docentes').delete().eq('id', id).select();
      if (error) throw error;
      return { rowCount: data ? data.length : 1 };
    }

    if (lowerSql.includes('from docentes')) {
      const cacheKey = `docentes_${sql}_${JSON.stringify(params)}`;
      const cachedData = getCache(cacheKey);
      if (cachedData) return cachedData;

      if (lowerSql.includes('where d.id =') || lowerSql.includes('where id =')) {
        const id = parseId(params[0]);
        const { data, error } = await supabase.from('docentes').select('*').eq('id', id);
        if (error) throw error;
        const rows = (data || []).map(d => ({
          ...d,
          clave_inicial: DOCENTE_KEYS_MAP[d.id] || DOCENTE_KEYS_MAP[d.correo ? d.correo.toLowerCase() : ''] || 'admin123',
          sede_nombre: SEDES_MAP[d.sede_id] || null,
          jornada_nombre: JORNADAS_MAP[d.jornada_id] || null
        }));
        const res = { rows };
        setCache(cacheKey, res);
        return res;
      }

      const { data, error } = await supabase.from('docentes').select('*').order('nombre');
      if (error) throw error;
      const rows = (data || []).map(d => ({
        ...d,
        clave_inicial: DOCENTE_KEYS_MAP[d.id] || DOCENTE_KEYS_MAP[d.correo ? d.correo.toLowerCase() : ''] || 'admin123',
        sede_nombre: SEDES_MAP[d.sede_id] || null,
        jornada_nombre: JORNADAS_MAP[d.jornada_id] || null
      }));
      const res = { rows };
      setCache(cacheKey, res);
      return res;
    }

    if (lowerSql.includes('insert into docentes')) {
      const [nombre, documento, correo, sede_id, jornada_id, areas, grados, clave_inicial] = params;
      if (clave_inicial) {
        if (correo) DOCENTE_KEYS_MAP[correo.toLowerCase()] = clave_inicial;
      }
      const { data, error } = await supabase.from('docentes').insert([{
        nombre, documento: documento || null, correo: correo || null, sede_id: sede_id || null, jornada_id: jornada_id || null, areas: areas || null, grados: grados || null
      }]).select();
      if (error) throw error;
      if (data && data[0]) {
        const newD = data[0];
        if (clave_inicial) {
          DOCENTE_KEYS_MAP[newD.id] = clave_inicial;
          if (newD.correo) DOCENTE_KEYS_MAP[newD.correo.toLowerCase()] = clave_inicial;
        }
      }
      return { rows: data || [] };
    }

    if (lowerSql.includes('update docentes')) {
      let cleanId = null;
      const payload = {};

      const idMatch = sql.match(/where\s+(?:id|d\.id)\s*=\s*(\d+|\$\d+)/i);
      if (idMatch) {
        const valStr = idMatch[1];
        if (valStr.startsWith('$')) {
          const idx = parseInt(valStr.substring(1)) - 1;
          cleanId = parseId(params[idx]);
        } else {
          cleanId = parseId(valStr);
        }
      }

      if (!cleanId && params.length > 0) {
        cleanId = parseId(params[params.length - 1]);
      }

      if (lowerSql.includes('clave_inicial')) {
        const passVal = params[0];
        if (passVal && cleanId) {
          DOCENTE_KEYS_MAP[cleanId] = passVal;
        }
      }

      if (lowerSql.includes('nombre =') || lowerSql.includes('nombre=')) {
        const [nombre, documento, correo, sede_id, jornada_id, estado, areas, grados, clave_inicial] = params;
        if (nombre !== undefined && nombre !== null) payload.nombre = nombre;
        if (documento !== undefined && documento !== null) payload.documento = documento;
        if (correo !== undefined && correo !== null) payload.correo = correo;
        if (sede_id !== undefined && sede_id !== null) payload.sede_id = sede_id;
        if (jornada_id !== undefined && jornada_id !== null) payload.jornada_id = jornada_id;
        if (estado !== undefined && estado !== null) payload.estado = estado;
        if (areas !== undefined && areas !== null) payload.areas = areas;
        if (grados !== undefined && grados !== null) payload.grados = grados;
        if (clave_inicial && cleanId && typeof clave_inicial === 'string' && isNaN(clave_inicial)) {
          DOCENTE_KEYS_MAP[cleanId] = clave_inicial;
        }
      }

      const { data, error } = await supabase.from('docentes').update(payload).eq('id', cleanId).select();
      if (error) throw error;
      return { rows: data || [], rowCount: data ? data.length : 0 };
    }

    // 4. SEMANAS INSTITUCIONALES
    if (lowerSql.includes('delete from semanas_institucionales')) {
      const id = parseId(params[0]);
      const { data, error } = await supabase.from('semanas_institucionales').delete().eq('id', id).select();
      if (error) throw error;
      return { rowCount: data ? data.length : 1 };
    }

    if (lowerSql.includes('from semanas_institucionales')) {
      const cacheKey = `semanas_${sql}_${JSON.stringify(params)}`;
      const cachedData = getCache(cacheKey);
      if (cachedData) return cachedData;

      if (lowerSql.includes('where anio =')) {
        const [anio, semana] = params;
        const { data, error } = await supabase.from('semanas_institucionales').select('*').eq('anio', anio).eq('numero_semana', semana);
        if (error) throw error;
        const res = { rows: data || [] };
        setCache(cacheKey, res);
        return res;
      }

      const { data, error } = await supabase.from('semanas_institucionales').select('*').order('anio', { ascending: false }).order('numero_semana', { ascending: true });
      if (error) throw error;
      const res = { rows: data || [] };
      setCache(cacheKey, res);
      return res;
    }

    if (lowerSql.includes('insert into semanas_institucionales')) {
      const [anio, numero_semana, motivo] = params;
      const { data, error } = await supabase.from('semanas_institucionales').insert([{
        anio, numero_semana, motivo
      }]).select();
      if (error) throw error;
      return { rows: data || [] };
    }

    // 5. PLANEACIONES
    if (lowerSql.includes('delete from planeaciones')) {
      const id = parseId(params[0]);
      const { data, error } = await supabase.from('planeaciones').delete().eq('id', id).select();
      if (error) throw error;
      return { rowCount: data ? data.length : 1 };
    }



    // 6. CONSULTA GENERAL DE PLANEACIONES
    if (lowerSql.includes('from planeaciones')) {
      const cacheKey = `planeaciones_${sql}_${JSON.stringify(params)}`;
      const cachedData = getCache(cacheKey);
      if (cachedData) return cachedData;

      let reqQuery = supabase.from('planeaciones').select('*, docentes!inner(*)').order('fecha_subida', { ascending: false });
      
      const matches = [...sql.matchAll(/([a-zA-Z0-9_\.]+)\s*(=|ilike)\s*\$(\d+)/gi)];
      for (const match of matches) {
        const field = match[1].trim().toLowerCase().replace(/^[pd]\./, '');
        const paramIdx = parseInt(match[3]) - 1;
        const val = params[paramIdx];

        if (val !== undefined && val !== null && val !== '') {
          if (field === 'docente_id') {
            reqQuery = reqQuery.eq('docente_id', val);
          } else if (field === 'sede_id') {
            reqQuery = reqQuery.eq('docentes.sede_id', val);
          } else if (field === 'jornada_id') {
            reqQuery = reqQuery.eq('docentes.jornada_id', val);
          } else if (field === 'grado') {
            const cleanVal = typeof val === 'string' ? val.replace(/%/g, '') : val;
            reqQuery = reqQuery.ilike('grado', `%${cleanVal}%`);
          } else if (field === 'estado') {
            reqQuery = reqQuery.eq('estado', val);
          } else if (field === 'numero_semana') {
            reqQuery = reqQuery.eq('numero_semana', val);
          }
        }
      }

      const { data, error } = await reqQuery;
      if (error) throw error;

      const rows = (data || []).map(p => {
        const d = p.docentes || {};
        return {
          ...p,
          docente_nombre: d.nombre || 'Docente',
          docente_correo: d.correo || '',
          docente_doc: d.documento || '',
          sede_nombre: SEDES_MAP[d.sede_id] || null,
          jornada_nombre: JORNADAS_MAP[d.jornada_id] || null
        };
      });
      const res = { rows };
      setCache(cacheKey, res);
      return res;
    }

    if (lowerSql.includes('insert into planeaciones')) {
      const [docente_id, area, grado, fecha_aplicacion, numero_semana, nombre_archivo, observaciones, estado] = params;
      const { data, error } = await supabase.from('planeaciones').insert([{
        docente_id, area, grado, fecha_aplicacion, numero_semana, nombre_archivo, observaciones, estado
      }]).select();
      if (error) throw error;
      return { rows: data || [] };
    }

    return { rows: [], rowCount: 0 };
  } catch (err) {
    console.error('Supabase Query Error:', err.message || err);
    throw err;
  }
}

module.exports = {
  supabase,
  query
};
