const db = require('../db');

// GET /api/docentes
exports.getAll = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT d.*, s.nombre AS sede_nombre, j.nombre AS jornada_nombre
      FROM docentes d
      LEFT JOIN sedes s ON s.id = d.sede_id
      LEFT JOIN jornadas j ON j.id = d.jornada_id
      ORDER BY d.nombre ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener docentes' });
  }
};

// GET /api/docentes/:id
exports.getOne = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT d.*, s.nombre AS sede_nombre, j.nombre AS jornada_nombre
      FROM docentes d
      LEFT JOIN sedes s ON s.id = d.sede_id
      LEFT JOIN jornadas j ON j.id = d.jornada_id
      WHERE d.id = $1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Docente no encontrado' });
    res.json(rows[0]);
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
    const { rows } = await db.query(
      `INSERT INTO docentes (nombre, documento, correo, sede_id, jornada_id, areas, grados, clave_inicial)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [nombre, documento || null, correo || null, sede_id || null, jornada_id || null, areas || null, grados || null, initialKey]
    );
    const docente = rows[0];

    // Crear cuenta de usuario para que el docente pueda iniciar sesión inmediatamente
    if (correo) {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash(initialKey, 10);
      await db.query(
        `INSERT INTO usuarios (nombre, correo, password_hash, rol, docente_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [nombre, correo.toLowerCase().trim(), hash, 'docente', docente.id]
      );
    }

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

  const { nombre, documento, correo, sede_id, jornada_id, estado, areas, grados, password } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE docentes SET
        nombre = COALESCE($1, nombre),
        documento = COALESCE($2, documento),
        correo = COALESCE($3, correo),
        sede_id = COALESCE($4, sede_id),
        jornada_id = COALESCE($5, jornada_id),
        estado = COALESCE($6, estado),
        areas = COALESCE($7, areas),
        grados = COALESCE($8, grados),
        clave_inicial = COALESCE($9, clave_inicial)
       WHERE id = $10 RETURNING *`,
      [nombre, documento, correo, sede_id, jornada_id, estado, areas, grados, password || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Docente no encontrado' });

    // Si Pedro especificó una nueva clave al editar, actualizar también en usuarios
    if (password) {
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash(password, 10);
      await db.query('UPDATE usuarios SET password_hash = $1 WHERE docente_id = $2', [hash, req.params.id]);
    }

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Error al actualizar docente' });
  }
};

// DELETE /api/docentes/:id
exports.remove = async (req, res) => {
  if (req.user.rol !== 'administrador')
    return res.status(403).json({ error: 'Sin permisos' });

  try {
    // Eliminar primero el usuario de acceso asociado para mantener integridad
    await db.query('DELETE FROM usuarios WHERE docente_id = $1', [req.params.id]);
    
    const { rowCount } = await db.query('DELETE FROM docentes WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Docente no encontrado' });
    res.json({ message: 'Docente y su usuario de acceso eliminados correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Error al eliminar docente' });
  }
};

// GET /api/sedes
exports.getSedes = async (req, res) => {
  const { rows } = await db.query('SELECT * FROM sedes WHERE activa = true ORDER BY nombre');
  res.json(rows);
};

// GET /api/jornadas
exports.getJornadas = async (req, res) => {
  const { rows } = await db.query('SELECT * FROM jornadas ORDER BY nombre');
  res.json(rows);
};
