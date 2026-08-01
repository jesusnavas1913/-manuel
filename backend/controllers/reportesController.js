const db = require('../db');

// GET /api/reportes
// Query params: docente_id, sede_id, jornada_id, grado, estado, semana, anio
exports.getReporte = async (req, res) => {
  const { docente_id, sede_id, jornada_id, grado, estado, semana, anio } = req.query;

  try {
    let conditions = [];
    let params = [];
    let idx = 1;

    // Si es docente, forzar su propio id
    if (req.user.rol === 'docente') {
      conditions.push(`p.docente_id = $${idx++}`);
      params.push(req.user.docente_id);
    } else if (docente_id) {
      conditions.push(`p.docente_id = $${idx++}`);
      params.push(docente_id);
    }

    if (sede_id) { conditions.push(`d.sede_id = $${idx++}`); params.push(sede_id); }
    if (jornada_id) { conditions.push(`d.jornada_id = $${idx++}`); params.push(jornada_id); }
    if (grado) { conditions.push(`p.grado ILIKE $${idx++}`); params.push(`%${grado}%`); }
    if (estado) { conditions.push(`p.estado = $${idx++}`); params.push(estado); }
    if (semana) { conditions.push(`p.numero_semana = $${idx++}`); params.push(semana); }
    if (anio) { conditions.push(`EXTRACT(YEAR FROM p.fecha_subida) = $${idx++}`); params.push(anio); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await db.query(`
      SELECT
        p.id, p.area, p.grado, p.fecha_aplicacion, p.numero_semana,
        p.fecha_subida, p.nombre_archivo, p.observaciones, p.estado,
        d.nombre AS docente_nombre, d.documento AS docente_doc,
        s.nombre AS sede_nombre, j.nombre AS jornada_nombre
      FROM planeaciones p
      JOIN docentes d ON d.id = p.docente_id
      LEFT JOIN sedes s ON s.id = d.sede_id
      LEFT JOIN jornadas j ON j.id = d.jornada_id
      ${where}
      ORDER BY p.fecha_subida DESC
    `, params);

    res.json(rows);
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
    const { rows } = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM docentes WHERE estado = 'activo') AS total_docentes,
        COUNT(*) FILTER (WHERE p.estado = 'a_tiempo') AS a_tiempo,
        COUNT(*) FILTER (WHERE p.estado = 'retraso') AS con_retraso,
        COUNT(*) FILTER (WHERE p.estado = 'no_entrego') AS no_entrego,
        COUNT(*) FILTER (WHERE p.estado = 'semana_institucional') AS semana_institucional,
        COUNT(*) AS total_planeaciones
      FROM planeaciones p
    `);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al calcular KPIs' });
  }
};
