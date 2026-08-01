const db = require('../db');

// Helper: calcular si es a tiempo (lunes = día 1, sábado = 6, domingo = 0)
function calcularEstado(fechaSubida, esSemanaInstitucional) {
  if (esSemanaInstitucional) return 'semana_institucional';
  const dia = new Date(fechaSubida).getDay(); // 0=Dom, 1=Lun, 6=Sáb
  // Entregas el sábado, domingo o lunes son a tiempo
  return (dia === 1 || dia === 0 || dia === 6) ? 'a_tiempo' : 'retraso';
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
    let query = `
      SELECT p.*, d.nombre AS docente_nombre, d.correo AS docente_correo,
             s.nombre AS sede_nombre, j.nombre AS jornada_nombre
      FROM planeaciones p
      JOIN docentes d ON d.id = p.docente_id
      LEFT JOIN sedes s ON s.id = d.sede_id
      LEFT JOIN jornadas j ON j.id = d.jornada_id
    `;
    const params = [];

    // Si es docente, solo sus planeaciones
    if (req.user.rol === 'docente') {
      query += ' WHERE p.docente_id = $1';
      params.push(req.user.docente_id);
    }

    query += ' ORDER BY p.fecha_subida DESC';
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener planeaciones' });
  }
};

// POST /api/planeaciones
exports.create = async (req, res) => {
  const { docente_id, area, grado, fecha_aplicacion, numero_semana, nombre_archivo, observaciones } = req.body;

  // Docente solo puede registrar las suyas
  const did = req.user.rol === 'docente' ? req.user.docente_id : docente_id;
  if (!did) return res.status(400).json({ error: 'docente_id requerido' });

  try {
    const ahora = new Date();
    const semana = numero_semana || semanaISO(ahora);

    // Verificar si es semana institucional
    const { rows: inst } = await db.query(
      'SELECT id FROM semanas_institucionales WHERE anio = $1 AND numero_semana = $2',
      [ahora.getFullYear(), semana]
    );
    const estado = calcularEstado(ahora, inst.length > 0);

    const { rows } = await db.query(
      `INSERT INTO planeaciones (docente_id, area, grado, fecha_aplicacion, numero_semana, nombre_archivo, observaciones, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [did, area, grado, fecha_aplicacion, semana, nombre_archivo, observaciones, estado]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar planeación' });
  }
};

// PUT /api/planeaciones/:id (solo admin)
exports.update = async (req, res) => {
  if (req.user.rol !== 'administrador')
    return res.status(403).json({ error: 'Sin permisos' });

  const { area, grado, fecha_aplicacion, numero_semana, nombre_archivo, observaciones, estado } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE planeaciones SET
        area = COALESCE($1, area),
        grado = COALESCE($2, grado),
        fecha_aplicacion = COALESCE($3, fecha_aplicacion),
        numero_semana = COALESCE($4, numero_semana),
        nombre_archivo = COALESCE($5, nombre_archivo),
        observaciones = COALESCE($6, observaciones),
        estado = COALESCE($7, estado)
       WHERE id = $8 RETURNING *`,
      [area, grado, fecha_aplicacion, numero_semana, nombre_archivo, observaciones, estado, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'No encontrada' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar' });
  }
};

// DELETE /api/planeaciones/:id (solo admin)
exports.remove = async (req, res) => {
  if (req.user.rol !== 'administrador')
    return res.status(403).json({ error: 'Sin permisos' });

  const { rowCount } = await db.query('DELETE FROM planeaciones WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'No encontrada' });
  res.json({ message: 'Eliminada' });
};
