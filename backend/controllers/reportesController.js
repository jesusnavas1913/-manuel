const { supabase, SEDES_MAP, JORNADAS_MAP } = require('../db');

// GET /api/reportes
// Query params: docente_id, sede_id, jornada_id, grado, estado, semana, anio
exports.getReporte = async (req, res) => {
  const { docente_id, sede_id, jornada_id, grado, estado, semana, anio } = req.query;

  try {
    let query = supabase.from('planeaciones').select('*, docentes!inner(*)', { count: 'exact' });

    // Si es docente, forzar su propio id
    if (req.user.rol === 'docente') {
      let did = req.user.docente_id;
      if (!did && req.user.correo) {
        const { data: dRows } = await supabase.from('docentes').select('id').eq('correo', req.user.correo.toLowerCase().trim());
        if (dRows && dRows.length > 0) did = dRows[0].id;
      }
      if (did) {
        query = query.eq('docente_id', parseInt(did));
      }
    } else if (docente_id) {
      query = query.eq('docente_id', parseInt(docente_id));
    }

    if (sede_id) { query = query.eq('docentes.sede_id', parseInt(sede_id)); }
    if (jornada_id) { query = query.eq('docentes.jornada_id', parseInt(jornada_id)); }
    if (grado) { query = query.ilike('grado', `%${grado}%`); }
    if (estado) { query = query.eq('estado', estado); }
    if (semana) { query = query.eq('numero_semana', parseInt(semana)); }

    query = query.order('fecha_subida', { ascending: false });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Apply pagination ONLY if we are not filtering by anio
    if (!anio) {
      query = query.range(from, to);
    }

    const { data: rows, error, count } = await query;
    if (error) throw error;

    let filteredRows = rows || [];
    if (anio) {
      filteredRows = filteredRows.filter(r => r.fecha_subida && r.fecha_subida.startsWith(anio));
    }

    let finalRows = filteredRows;
    let finalCount = count || 0;
    
    if (anio) {
      finalCount = filteredRows.length;
      finalRows = filteredRows.slice(from, to + 1);
    }

    const mapped = finalRows.map(p => {
      const d = p.docentes || {};
      return {
        ...p,
        docente_nombre: d.nombre || 'Docente Institucional',
        docente_doc: d.documento || '--',
        sede_nombre: SEDES_MAP[d.sede_id || 1] || 'I.E. Guaimaral',
        jornada_nombre: JORNADAS_MAP[d.jornada_id || 1] || 'Mañana'
      };
    });

    const totalPages = Math.ceil(finalCount / limit) || 1;

    res.json({
      data: mapped,
      total: finalCount,
      page,
      totalPages
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar reporte' });
  }
};

// GET /api/reportes/kpi — para el dashboard (solo administradores)
exports.getKPI = async (req, res) => {
  if (req.user.rol !== 'administrador') {
    return res.status(403).json({ error: 'Acceso restringido a administradores' });
  }

  try {
    const { count: total_docentes } = await supabase.from('docentes').select('id', { count: 'exact', head: true }).eq('estado', 'activo');
    
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
