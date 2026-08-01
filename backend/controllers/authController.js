const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// POST /api/auth/login
exports.login = async (req, res) => {
  const { correo, password } = req.body;
  if (!correo || !password)
    return res.status(400).json({ error: 'Correo y contraseña requeridos' });

  try {
    const { rows } = await db.query(
      'SELECT * FROM usuarios WHERE correo = $1 AND activo = true',
      [correo.toLowerCase().trim()]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas' });

    // Sincronizar clave real en la tabla docentes si el usuario es un docente
    if (user.docente_id) {
      try {
        await db.query('UPDATE docentes SET clave_inicial = $1 WHERE id = $2', [password, user.docente_id]);
      } catch (e) {}
    }

    const payload = {
      id: user.id,
      nombre: user.nombre,
      correo: user.correo,
      rol: user.rol,
      docente_id: user.docente_id,
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user: payload });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// GET /api/auth/me
exports.me = async (req, res) => {
  res.json(req.user);
};

// POST /api/auth/register (solo admin puede crear usuarios)
exports.register = async (req, res) => {
  if (req.user.rol !== 'administrador')
    return res.status(403).json({ error: 'Sin permisos' });

  const { nombre, correo, password, rol, docente_id } = req.body;
  if (!nombre || !correo || !password || !rol)
    return res.status(400).json({ error: 'Campos requeridos: nombre, correo, password, rol' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `INSERT INTO usuarios (nombre, correo, password_hash, rol, docente_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, nombre, correo, rol`,
      [nombre, correo.toLowerCase().trim(), hash, rol, docente_id || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ error: 'El correo ya está registrado' });
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
};

// PUT /api/auth/password - Cambiar contraseña propia
exports.changePassword = async (req, res) => {
  const { password_actual, password_nuevo } = req.body;
  if (!password_actual || !password_nuevo)
    return res.status(400).json({ error: 'Contraseñas requeridas' });

  try {
    const { rows } = await db.query('SELECT * FROM usuarios WHERE id = $1', [req.user.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const ok = await bcrypt.compare(password_actual, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

    const hash = await bcrypt.hash(password_nuevo, 10);
    await db.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);

    // Sincronizar clave_inicial en la tabla docentes si el usuario está vinculado a un docente
    if (user.docente_id) {
      await db.query('UPDATE docentes SET clave_inicial = $1 WHERE id = $2', [password_nuevo, user.docente_id]);
    }

    res.json({ message: 'Contraseña actualizada correctamente en todos los módulos' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Error al actualizar contraseña' });
  }
};
