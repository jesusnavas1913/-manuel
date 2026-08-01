const db = require('../db');

// GET /api/semanas
exports.getAll = async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM semanas_institucionales ORDER BY anio DESC, numero_semana ASC'
  );
  res.json(rows);
};

// POST /api/semanas (solo admin)
exports.create = async (req, res) => {
  if (req.user.rol !== 'administrador')
    return res.status(403).json({ error: 'Sin permisos' });

  const { anio, numero_semana, motivo } = req.body;
  if (!anio || !numero_semana)
    return res.status(400).json({ error: 'anio y numero_semana requeridos' });

  try {
    const { rows } = await db.query(
      'INSERT INTO semanas_institucionales (anio, numero_semana, motivo) VALUES ($1, $2, $3) RETURNING *',
      [anio, numero_semana, motivo]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear semana institucional' });
  }
};

// DELETE /api/semanas/:id (solo admin)
exports.remove = async (req, res) => {
  if (req.user.rol !== 'administrador')
    return res.status(403).json({ error: 'Sin permisos' });

  const { rowCount } = await db.query(
    'DELETE FROM semanas_institucionales WHERE id = $1', [req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'No encontrada' });
  res.json({ message: 'Eliminada' });
};
