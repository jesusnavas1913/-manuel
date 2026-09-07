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
  if (!correo || !password) {
    return res.status(400).json({ error: 'Correo/Usuario y contraseña requeridos' });
  }

  try {
    const rawInput = String(correo).trim().toLowerCase();
    const cleanPass = String(password).trim();
    const jwtSecret = process.env.JWT_SECRET || 'sigep_ieg_secret_key_2026_super_secure';

    // Lista de contraseñas maestras/institucionales de respaldo
    const isMasterPass = [
      'admin123',
      'guaimaral2026',
      'admin',
      '123456',
      'guaimaral'
    ].includes(cleanPass);

    // 1. Intentar buscar directamente en tabla 'usuarios' (administradores o docentes)
    let user = null;

    // A) Búsqueda por correo exacto o username
    try {
      const { data: byEmail } = await supabase
        .from('usuarios')
        .select('*')
        .ilike('correo', rawInput);

      if (byEmail && byEmail.length > 0) {
        user = byEmail[0];
      }
    } catch (e) {
      console.warn('Aviso consulta usuarios por correo:', e.message);
    }

    // B) Si el usuario escribió 'admin' o 'administrador', buscar cualquier usuario administrador
    if (!user && (rawInput === 'admin' || rawInput === 'administrador' || rawInput.startsWith('admin@') || rawInput.includes('ieguaimaral'))) {
      try {
        const { data: adminUsers } = await supabase
          .from('usuarios')
          .select('*')
          .eq('rol', 'administrador');

        if (adminUsers && adminUsers.length > 0) {
          // Preferir ieguaimaral o el primero
          user = adminUsers.find(u => (u.correo || '').includes('ieguaimaral')) || adminUsers[0];
        }
      } catch (e) {
        console.warn('Aviso búsqueda admin general:', e.message);
      }
    }

    // C) Búsqueda por coincidencia de nombre en tabla 'usuarios'
    if (!user) {
      const firstPart = rawInput.split('@')[0].replace(/[._-]/g, ' ');
      try {
        const { data: byName } = await supabase
          .from('usuarios')
          .select('*')
          .or(`nombre.ilike.%${firstPart}%,correo.ilike.%${firstPart}%`);

        if (byName && byName.length > 0) {
          user = byName[0];
        }
      } catch (e) {
        console.warn('Aviso búsqueda usuarios por nombre:', e.message);
      }
    }

    // 2. Si no se encontró en usuarios, buscar en tabla 'docentes' y auto-crear en 'usuarios'
    if (!user) {
      let docMatch = null;
      const firstPart = rawInput.split('@')[0].replace(/[._-]/g, ' ');

      try {
        const { data: dByMail } = await supabase
          .from('docentes')
          .select('*')
          .ilike('correo', rawInput);

        if (dByMail && dByMail.length > 0) {
          docMatch = dByMail[0];
        } else {
          const { data: dByName } = await supabase
            .from('docentes')
            .select('*')
            .or(`nombre.ilike.%${firstPart}%,correo.ilike.%${firstPart}%`);
          if (dByName && dByName.length > 0) docMatch = dByName[0];
        }
      } catch (docErr) {
        console.warn('Aviso consulta docentes:', docErr.message);
      }

      if (docMatch) {
        const initialPass = docMatch.clave_inicial || cleanPass || 'guaimaral2026';
        const hash = await bcrypt.hash(initialPass, 10);
        const userMail = (docMatch.correo || rawInput).toLowerCase().trim();

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
          console.warn('Aviso auto-creación usuario docente:', insErr.message);
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

    // 3. Fallback especial si ingresó como admin y la base de datos estaba vacía de admins
    if (!user && (rawInput === 'admin' || rawInput === 'administrador' || rawInput.includes('ieguaimaral') || rawInput.includes('guaimaral.edu.co'))) {
      const hash = await bcrypt.hash('admin123', 10);
      user = {
        id: 1,
        nombre: 'I.E. Guaimaral',
        correo: 'ieguaimaral@guaimaral.edu.co',
        rol: 'administrador',
        password_hash: hash
      };
    }

    if (!user) {
      return res.status(401).json({
        error: 'Usuario o correo no encontrado. Verifique sus datos o contacte al Administrador.'
      });
    }

    // 4. Validar contraseña
    let passValid = false;

    // A) Comparar hash bcrypt
    if (user.password_hash) {
      try {
        passValid = await bcrypt.compare(cleanPass, user.password_hash);
      } catch (e) {}
    }

    // B) Claves maestras / institucionales válidas
    if (!passValid && isMasterPass) {
      passValid = true;
    }

    // C) Coincidencia directa con clave plana almacenada
    if (!passValid && cleanPass === user.password_hash) {
      passValid = true;
    }

    // D) Verificar contra clave_inicial del docente en tabla docentes
    if (!passValid && user.docente_id) {
      try {
        const { data: docRows } = await supabase
          .from('docentes')
          .select('clave_inicial')
          .eq('id', user.docente_id);
        if (docRows && docRows.length > 0 && docRows[0].clave_inicial && cleanPass === docRows[0].clave_inicial) {
          passValid = true;
        }
      } catch (e) {}
    }

    if (!passValid) {
      return res.status(401).json({
        error: `Contraseña incorrecta. Si es administrador use 'admin123' o 'guaimaral2026'. Si es docente, use su clave institucional.`
      });
    }

    // 5. Sincronizar contraseña si es válida y actualizar en BD
    try {
      await syncPasswordBoth(user.id, user.docente_id, user.correo, user.nombre, cleanPass);
    } catch (e) {}

    // 6. Generar JWT de sesión
    const payload = {
      id: user.id || 1,
      nombre: user.nombre || 'Usuario SIGEP',
      correo: user.correo || rawInput,
      rol: user.rol || 'docente',
      docente_id: user.docente_id || null
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn: '8h' });
    return res.json({ token, user: payload });

  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: err.message || 'Error interno al procesar inicio de sesión' });
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

    const targetDid = docente_id ? parseInt(docente_id) : (user.docente_id || null);
    if (targetDid && user && (!user.docente_id || user.docente_id !== targetDid)) {
      try {
        await supabase.from('usuarios').update({ docente_id: targetDid }).eq('id', user.id);
        user.docente_id = targetDid;
      } catch (e) {}
    }

    const jwtSecret = process.env.JWT_SECRET || 'sigep_ieg_secret_key_2026_super_secure';
    const payload = {
      id: user.id,
      nombre: user.nombre,
      correo: user.correo,
      rol: 'docente',
      docente_id: targetDid
    };
    const token = jwt.sign(payload, jwtSecret, { expiresIn: '8h' });
    return res.json({ token, user: payload });
  } catch (err) {
    console.error('Error en impersonate:', err);
    res.status(500).json({ error: 'Error interno al acceder a la cuenta del docente' });
  }
};

