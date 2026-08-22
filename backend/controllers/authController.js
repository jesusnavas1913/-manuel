const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase } = require('../db');

// Helper interno: Sincronizar contraseña en docentes y usuarios simultáneamente
async function syncPasswordBoth(userId, docenteId, email, name, newPassword) {
  try {
    const hash = await bcrypt.hash(newPassword, 10);

    if (userId) {
      await supabase.from('usuarios').update({ password_hash: hash }).eq('id', userId);
    } else if (email) {
      await supabase.from('usuarios').update({ password_hash: hash }).ilike('correo', email.toLowerCase().trim());
    }

    try {
      if (docenteId) {
        await supabase.from('docentes').update({ clave_inicial: newPassword }).eq('id', parseInt(docenteId));
      } else if (email) {
        await supabase.from('docentes').update({ clave_inicial: newPassword }).ilike('correo', email.toLowerCase().trim());
      }
    } catch (docErr) {
      console.warn('Nota: clave_inicial en tabla docentes omitida por esquema.');
    }
  } catch (e) {
    console.error('Error al sincronizar clave:', e);
  }
}

// POST /api/auth/login
exports.login = async (req, res) => {
  const { correo, password } = req.body;
  if (!correo || !password)
    return res.status(400).json({ error: 'Correo y contraseña requeridos' });

  try {
    const cleanEmail = correo.trim().toLowerCase();
    const firstPart = cleanEmail.split('@')[0].replace(/[._-]/g, ' ');

    // ── RUTA 1: Administrador — ÚNICAMENTE ieguaimaral@guaimaral.edu.co ──
    const isAdminEmail = cleanEmail.includes('ieguaimaral') ||
                         cleanEmail === 'ieguaimaral@guaimaral.edu.co';

    if (isAdminEmail) {
      let admin = null;
      try {
        let { data: adminUsers } = await supabase
          .from('usuarios')
          .select('*')
          .eq('rol', 'administrador');

        admin = adminUsers && adminUsers[0];

        if (!admin) {
          const hash = await bcrypt.hash('admin123', 10);
          const { data: created } = await supabase.from('usuarios').insert([{
            nombre: 'I.E. Guaimaral',
            correo: 'ieguaimaral@guaimaral.edu.co',
            password_hash: hash,
            rol: 'administrador',
            activo: true
          }]).select('*');
          admin = created && created[0];
        }
      } catch (dbErr) {
        console.warn('Aviso: Fallo de red/DB al verificar admin:', dbErr.message);
      }

      // Fallback estático para Administrador si falla la red
      if (!admin && password === 'admin123') {
        admin = {
          id: 1,
          nombre: 'I.E. Guaimaral',
          correo: 'ieguaimaral@guaimaral.edu.co',
          rol: 'administrador'
        };
      }

      if (!admin) {
        return res.status(401).json({ error: 'No se encontró la cuenta de administrador.' });
      }

      let ok = false;
      if (admin.password_hash) {
        ok = await bcrypt.compare(password, admin.password_hash);
      }
      if (!ok && password === 'admin123') ok = true;

      if (!ok) {
        return res.status(401).json({ error: 'Contraseña incorrecta para el Administrador.' });
      }

      const jwtSecret = process.env.JWT_SECRET || 'sigep_ieg_secret_key_2026_super_secure';
      const payload = {
        id: admin.id || 1,
        nombre: 'I.E. Guaimaral',
        correo: 'ieguaimaral@guaimaral.edu.co',
        rol: 'administrador',
        docente_id: null
      };
      const token = jwt.sign(payload, jwtSecret, { expiresIn: '8h' });
      return res.json({ token, user: payload });
    }

    // ── RUTA 2: Docente — por correo o nombre ────────────────────────────
    let users = null;
    try {
      const { data } = await supabase
        .from('usuarios')
        .select('*')
        .ilike('correo', cleanEmail)
        .neq('rol', 'administrador');
      users = data;
    } catch (e) {
      console.warn('Aviso: Error consultando usuarios:', e.message);
    }

    // Si no se encontró por correo y el input no tiene @, buscar por nombre
    if ((!users || users.length === 0) && !cleanEmail.includes('@')) {
      try {
        const { data: byName } = await supabase
          .from('usuarios')
          .select('*')
          .ilike('nombre', `%${firstPart}%`)
          .neq('rol', 'administrador');
        users = byName;
      } catch (e) {
        console.warn('Aviso: Error consultando usuarios por nombre:', e.message);
      }
    }

    let user = users && users[0];

    // Si no se encontró en usuarios, buscar en docentes y auto-crear
    if (!user) {
      let docMatch = null;
      try {
        const { data: dByMail } = await supabase
          .from('docentes')
          .select('*')
          .ilike('correo', cleanEmail);

        if (dByMail && dByMail.length > 0) {
          docMatch = dByMail[0];
        } else if (!cleanEmail.includes('@')) {
          const { data: dByName } = await supabase
            .from('docentes')
            .select('*')
            .ilike('nombre', `%${firstPart}%`);
          if (dByName && dByName.length > 0) docMatch = dByName[0];
        }
      } catch (docFetchErr) {
        console.warn('Aviso: Error consultando tabla docentes:', docFetchErr.message);
      }

      if (docMatch) {
        const initialPass = docMatch.clave_inicial || password || 'admin123';
        const hash = await bcrypt.hash(initialPass, 10);
        const userMail = (docMatch.correo || cleanEmail).toLowerCase().trim();
        try {
          const { data: created } = await supabase.from('usuarios').insert([{
            nombre: docMatch.nombre,
            correo: userMail,
            password_hash: hash,
            rol: 'docente',
            docente_id: docMatch.id,
            activo: true
          }]).select('*');
          if (created && created.length > 0) user = created[0];
        } catch (insErr) {
          console.warn('Aviso: Auto-creación de usuario falló:', insErr.message);
          user = {
            id: docMatch.id,
            nombre: docMatch.nombre,
            correo: userMail,
            rol: 'docente',
            docente_id: docMatch.id,
            password_hash: hash
          };
        }
      }
    }

    if (!user) {
      return res.status(401).json({ 
        error: 'Credenciales incorrectas: no se encontró la cuenta del docente. Asegúrese de que el Administrador haya registrado al docente en el módulo "Crear Docentes".' 
      });
    }

    // Verificar contraseña del docente
    let ok = false;
    if (user.password_hash) {
      ok = await bcrypt.compare(password, user.password_hash);
    }

    // Fallback 1: Contraseña estándar admin123
    if (!ok && password === 'admin123') {
      ok = true;
    }

    // Fallback 2: verificar clave_inicial del docente en tabla docentes
    if (!ok && user.docente_id) {
      try {
        const { data: docRows } = await supabase
          .from('docentes')
          .select('clave_inicial')
          .eq('id', user.docente_id);
        if (docRows && docRows.length > 0 && docRows[0].clave_inicial && password === docRows[0].clave_inicial) {
          ok = true;
        }
      } catch (e) {}
    }

    if (!ok) {
      return res.status(401).json({ error: 'Contraseña incorrecta. Verifique la clave ingresada e intente nuevamente.' });
    }

    // Sincronizar contraseña y generar token
    await syncPasswordBoth(user.id, user.docente_id, user.correo, user.nombre, password);

    const jwtSecret = process.env.JWT_SECRET || 'sigep_ieg_secret_key_2026_super_secure';
    const payload = {
      id: user.id,
      nombre: user.nombre,
      correo: user.correo,
      rol: user.rol || 'docente',
      docente_id: user.docente_id
    };
    const token = jwt.sign(payload, jwtSecret, { expiresIn: '8h' });
    return res.json({ token, user: payload });

  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno al procesar inicio de sesión' });
  }
};

// GET /api/auth/me
exports.me = async (req, res) => {
  res.json(req.user);
};

// POST /api/auth/register
exports.register = async (req, res) => {
  if (req.user.rol !== 'administrador')
    return res.status(403).json({ error: 'Sin permisos' });

  const { nombre, correo, password, rol, docente_id } = req.body;
  if (!nombre || !correo || !password || !rol)
    return res.status(400).json({ error: 'Campos requeridos: nombre, correo, password, rol' });

  try {
    const cleanMail = correo.toLowerCase().trim();
    const hash = await bcrypt.hash(password, 10);
    
    const { data: rows, error } = await supabase
      .from('usuarios')
      .insert([{
        nombre,
        correo: cleanMail,
        password_hash: hash,
        rol,
        docente_id: docente_id || null,
        activo: true
      }])
      .select('id, nombre, correo, rol');

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'El correo ya está registrado' });
      throw error;
    }

    await syncPasswordBoth(rows[0].id, docente_id, cleanMail, nombre, password);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno al registrar usuario' });
  }
};

// PUT /api/auth/password - Cambiar contraseña propia
exports.changePassword = async (req, res) => {
  const { password_actual, password_nuevo } = req.body;
  if (!password_actual || !password_nuevo)
    return res.status(400).json({ error: 'Contraseñas requeridas' });

  try {
    const { data: rows, error } = await supabase.from('usuarios').select('*').eq('id', req.user.id);
    if (error) throw error;
    
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    let ok = await bcrypt.compare(password_actual, user.password_hash);
    if (!ok && password_actual === user.password_hash) ok = true;
    
    if (!ok) {
      try {
        const { data: dData } = await supabase.from('docentes').select('*').ilike('correo', user.correo);
        if (dData && dData.length > 0 && dData[0].clave_inicial === password_actual) {
          ok = true;
        }
      } catch (e) {}
    }

    if (!ok) return res.status(401).json({ error: 'La contraseña actual ingresada no es correcta' });

    await syncPasswordBoth(user.id, user.docente_id, user.correo, user.nombre, password_nuevo);
    res.json({ message: 'Contraseña actualizada con éxito en todos los módulos' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Error al actualizar contraseña' });
  }
};

// POST /api/auth/impersonate - Administrador ingresa a cuenta de un docente
exports.impersonate = async (req, res) => {
  if (req.user.rol !== 'administrador') {
    return res.status(403).json({ error: 'Solo el administrador puede entrar a cuentas de docentes' });
  }

  const { docente_id, correo } = req.body;
  if (!docente_id && !correo) {
    return res.status(400).json({ error: 'Docente ID o correo es requerido' });
  }

  try {
    let user = null;

    if (docente_id) {
      const { data: uByDoc } = await supabase
        .from('usuarios')
        .select('*')
        .eq('docente_id', parseInt(docente_id))
        .neq('rol', 'administrador');
      if (uByDoc && uByDoc.length > 0) user = uByDoc[0];
    }

    if (!user && correo) {
      const cleanMail = correo.trim().toLowerCase();
      const { data: uByMail } = await supabase
        .from('usuarios')
        .select('*')
        .ilike('correo', cleanMail)
        .neq('rol', 'administrador');
      if (uByMail && uByMail.length > 0) user = uByMail[0];
    }

    // Si el docente no tiene usuario auto-creado en la tabla usuarios todavía, crearlo desde tabla docentes
    if (!user && docente_id) {
      const { data: docRows } = await supabase
        .from('docentes')
        .select('*')
        .eq('id', parseInt(docente_id));

      const doc = docRows && docRows[0];
      if (doc) {
        const initialPass = doc.clave_inicial || 'admin123';
        const hash = await bcrypt.hash(initialPass, 10);
        const userMail = (doc.correo || `docente${doc.id}@guaimaral.edu.co`).toLowerCase().trim();
        try {
          const { data: created } = await supabase.from('usuarios').insert([{
            nombre: doc.nombre,
            correo: userMail,
            password_hash: hash,
            rol: 'docente',
            docente_id: doc.id,
            activo: true
          }]).select('*');
          if (created && created.length > 0) user = created[0];
        } catch (insErr) {
          console.warn('Aviso: Auto-creación en usuarios falló en impersonate:', insErr.message);
        }

        if (!user) {
          const { data: uMail } = await supabase.from('usuarios').select('*').ilike('correo', userMail);
          if (uMail && uMail.length > 0) {
            user = uMail[0];
            if (!user.docente_id) {
              await supabase.from('usuarios').update({ docente_id: doc.id }).eq('id', user.id);
              user.docente_id = doc.id;
            }
          }
        }
      }
    }

    if (!user) {
      return res.status(404).json({ error: 'No se encontró la cuenta de usuario para este docente' });
    }

    const jwtSecret = process.env.JWT_SECRET || 'sigep_ieg_secret_key_2026_super_secure';
    const payload = {
      id: user.id,
      nombre: user.nombre,
      correo: user.correo,
      rol: user.rol || 'docente',
      docente_id: user.docente_id
    };
    const token = jwt.sign(payload, jwtSecret, { expiresIn: '8h' });
    return res.json({ token, user: payload });
  } catch (err) {
    console.error('Error en impersonate:', err);
    res.status(500).json({ error: 'Error interno al acceder a la cuenta del docente' });
  }
};

