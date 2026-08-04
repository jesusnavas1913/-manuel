const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://bulrbsaoxwuibslfhlef.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1bHJic2FveHd1aWJzbGZobGVmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTMzNDAyMSwiZXhwIjoyMTAwOTEwMDIxfQ.MsQ9sTKtvodOT_gY2z3C1UeQQJJu8YqCs9RkRKATOOc'
);

async function main() {
  console.log('🔧 Iniciando setup de Administrador en Supabase...\n');

  // 1. Ver qué hay en la tabla usuarios
  const { data: allUsers, error: fetchErr } = await supabase.from('usuarios').select('*');
  if (fetchErr) {
    console.error('❌ Error al leer tabla usuarios:', fetchErr.message);
    process.exit(1);
  }
  console.log(`📋 Usuarios actuales en Supabase (${allUsers.length} total):`);
  allUsers.forEach(u => console.log(`  - [${u.id}] ${u.correo} | rol: ${u.rol} | activo: ${u.activo}`));

  // 2. Generar hash bcrypt fresco de admin123
  const hash = await bcrypt.hash('admin123', 10);
  console.log('\n🔑 Hash bcrypt generado para admin123:', hash);

  // 3. Eliminar todos los administradores duplicados o con correo incorrecto
  const { data: admins } = await supabase.from('usuarios').select('*').eq('rol', 'administrador');
  if (admins && admins.length > 0) {
    console.log(`\n♻️  Actualizando ${admins.length} administrador(es) existente(s)...`);
    for (const admin of admins) {
      const { error: upErr } = await supabase.from('usuarios').update({
        nombre: 'Pedro Administrador',
        correo: 'ieguaimaral@guaimaral.edu.co',
        password_hash: hash,
        rol: 'administrador',
        activo: true
      }).eq('id', admin.id);
      if (upErr) console.error(`  ❌ Error al actualizar admin ${admin.id}:`, upErr.message);
      else console.log(`  ✅ Admin ${admin.id} actualizado correctamente`);
    }
  } else {
    console.log('\n➕ No existe administrador. Creando...');
    const { data: created, error: insErr } = await supabase.from('usuarios').insert([{
      nombre: 'Pedro Administrador',
      correo: 'ieguaimaral@guaimaral.edu.co',
      password_hash: hash,
      rol: 'administrador',
      activo: true
    }]).select('*');
    if (insErr) {
      console.error('❌ Error al crear admin:', insErr.message);
      process.exit(1);
    }
    console.log('✅ Admin creado:', created[0]);
  }

  // 4. Verificar estado final
  const { data: final } = await supabase.from('usuarios').select('*').eq('rol', 'administrador');
  console.log('\n✅ Estado final del administrador en Supabase:');
  final.forEach(u => console.log(`  - ID: ${u.id} | Correo: ${u.correo} | Activo: ${u.activo}`));

  // 5. Verificar contraseña
  const { data: check } = await supabase.from('usuarios').select('*').eq('correo', 'ieguaimaral@guaimaral.edu.co').single();
  if (check) {
    const ok = await bcrypt.compare('admin123', check.password_hash);
    console.log(`\n🔐 Verificación de contraseña admin123: ${ok ? '✅ CORRECTA' : '❌ INCORRECTA'}`);
  }

  console.log('\n🎉 ¡Setup completado! Credenciales de acceso:');
  console.log('   📧 Correo: ieguaimaral@guaimaral.edu.co');
  console.log('   🔑 Contraseña: admin123');
}

main().catch(console.error);
