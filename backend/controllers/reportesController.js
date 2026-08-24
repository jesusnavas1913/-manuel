const { supabase, SEDES_MAP, JORNADAS_MAP } = require('../db');

function getCurrentAcademicWeekBackend(d = new Date()) {
  const date = new Date(d.valueOf());
  if (date.getDay() === 0) {
    date.setDate(date.getDate() + 1);
  }
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target) / 604800000);
}

const MIN_SEMANA_LECTIVA = 32;

// GET /api/reportes
// Query params: docente_id, sede_id, jornada_id, grado, estado, semana, anio
exports.getReporte = async (req, res) => {
  const { docente_id, sede_id, jornada_id, grado, estado, semana, anio } = req.query;

  try {
    // 1. Obtener todas las planeaciones reales
    const { data: realPlanes, error: pErr } = await supabase
      .from('planeaciones')
      .select('*, docentes(*)');
    if (pErr) throw pErr;

    // 2. Obtener todos los docentes activos
    const { data: allDocentes, error: dErr } = await supabase
      .from('docentes')
      .select('*')
      .eq('estado', 'activo');
    if (dErr) throw dErr;

    const currentW = getCurrentAcademicWeekBackend(new Date());
    const targetMaxWeek = semana ? parseInt(semana) : currentW;
    const targetMinWeek = semana ? parseInt(semana) : MIN_SEMANA_LECTIVA;

    // Map de entregas existentes por docente y semana
    const realPlansMap = new Set();
    const cleanRealPlanes = (realPlanes || []).filter(p => p.estado !== 'no_entrego');
    
    cleanRealPlanes.forEach(p => {
      if (p.docente_id && p.numero_semana) {
        realPlansMap.add(`${p.docente_id}_${p.numero_semana}`);
      }
    });

    // 3. Generar entregas sintéticas de 'no_entrego' ÚNICAMENTE si se filtra por estado 'no_entrego'
    const syntheticNoEntrego = [];
    if (estado === 'no_entrego') {
      (allDocentes || []).forEach(d => {
        for (let w = targetMinWeek; w <= targetMaxWeek; w++) {
          if (w < MIN_SEMANA_LECTIVA) continue;
          const key = `${d.id}_${w}`;
          if (!realPlansMap.has(key)) {
            syntheticNoEntrego.push({
              id: `synthetic_no_${d.id}_sem${w}`,
              docente_id: d.id,
              docentes: d,
              area: d.areas ? d.areas.split(',')[0] : 'General',
              grado: d.grados ? d.grados.split(',')[0] : 'Sin Grado',
              numero_semana: w,
              fecha_subida: null,
              fecha_aplicacion: null,
              nombre_archivo: null,
              observaciones: 'Registro automático: Pendiente de entrega en la plataforma SIGEP',
              estado: 'no_entrego'
            });
          }
        }
      });
    }

    // 4. Determinar lista de registros
    let allRecords = estado === 'no_entrego' ? syntheticNoEntrego : [...cleanRealPlanes];

    // 5. Filtrar por permisos de docente logueado
    if (req.user.rol === 'docente') {
      let did = req.user.docente_id;
      if (!did && req.user.correo) {
        const match = (allDocentes || []).find(d => d.correo && d.correo.toLowerCase().trim() === req.user.correo.toLowerCase().trim());
        if (match) did = match.id;
      }
      if (did) {
        allRecords = allRecords.filter(r => String(r.docente_id) === String(did));
      }
    } else if (docente_id) {
      allRecords = allRecords.filter(r => String(r.docente_id) === String(docente_id));
    }

    // 6. Aplicar Filtros Dinámicos
    if (sede_id) {
      const sId = parseInt(sede_id);
      allRecords = allRecords.filter(r => r.docentes && parseInt(r.docentes.sede_id) === sId);
    }
    if (jornada_id) {
      const jId = parseInt(jornada_id);
      allRecords = allRecords.filter(r => r.docentes && parseInt(r.docentes.jornada_id) === jId);
    }
    if (grado) {
      const gStr = grado.toLowerCase().trim();
      allRecords = allRecords.filter(r => (r.grado || '').toLowerCase().includes(gStr));
    }
    if (estado) {
      allRecords = allRecords.filter(r => r.estado === estado);
    }
    if (semana) {
      const semNum = parseInt(semana);
      allRecords = allRecords.filter(r => parseInt(r.numero_semana) === semNum);
    }
    if (anio) {
      allRecords = allRecords.filter(r => r.fecha_subida && r.fecha_subida.startsWith(anio));
    }

    // Ordenar: primero no_entrego / retraso, luego por número de semana descendente
    allRecords.sort((a, b) => (b.numero_semana || 0) - (a.numero_semana || 0));

    // 7. Paginación
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const totalCount = allRecords.length;
    const from = (page - 1) * limit;
    const paginatedRecords = allRecords.slice(from, from + limit);

    const mapped = paginatedRecords.map(p => {
      const d = p.docentes || {};
      const sId = (d && d.sede_id !== undefined && d.sede_id !== null) ? parseInt(d.sede_id) : null;
      const jId = (d && d.jornada_id !== undefined && d.jornada_id !== null) ? parseInt(d.jornada_id) : null;

      return {
        ...p,
        docente_nombre: d.nombre || 'Docente Institucional',
        docente_doc: d.documento || '--',
        sede_nombre: (sId && SEDES_MAP[sId]) ? SEDES_MAP[sId] : (d.sede_nombre || 'I.E. Guaimaral'),
        jornada_nombre: (jId && JORNADAS_MAP[jId]) ? JORNADAS_MAP[jId] : (d.jornada_nombre || 'Mañana')
      };
    });

    const totalPages = Math.ceil(totalCount / limit) || 1;

    const stats = {
      total_subidas_reales: cleanRealPlanes.length,
      a_tiempo: cleanRealPlanes.filter(r => r.estado === 'a_tiempo').length,
      retraso: cleanRealPlanes.filter(r => r.estado === 'retraso').length,
      no_entrego: syntheticNoEntrego.length,
      semana_institucional: cleanRealPlanes.filter(r => r.estado === 'semana_institucional').length
    };

    res.json({
      data: mapped,
      total: totalCount,
      stats,
      page,
      totalPages
    });
  } catch (err) {
    console.error('Error al generar reporte:', err);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
};

// GET /api/reportes/kpi — para el dashboard (solo administradores)
exports.getKPI = async (req, res) => {
  if (req.user.rol !== 'administrador') {
    return res.status(403).json({ error: 'Acceso restringido a administradores' });
  }

  try {
    const { count: total_docentes } = await supabase.from('docentes').select('id', { count: 'exact', head: true });
    
    const { data: planes, error } = await supabase.from('planeaciones').select('estado');
    if (error) throw error;
    
    const a_tiempo = planes.filter(p => p.estado === 'a_tiempo').length;
    const con_retraso = planes.filter(p => p.estado === 'retraso').length;
    const no_entrego = planes.filter(p => p.estado === 'no_entrego').length;
    const semana_institucional = planes.filter(p => p.estado === 'semana_institucional').length;

    res.json({
      total_docentes: total_docentes || 0,
      a_tiempo,
      con_retraso,
      no_entrego,
      semana_institucional,
      total_planeaciones: planes.length
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular KPIs' });
  }
};
