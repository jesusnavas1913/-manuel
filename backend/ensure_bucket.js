const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://bulrbsaoxwuibslfhlef.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1bHJic2FveHd1aWJzbGZobGVmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTMzNDAyMSwiZXhwIjoyMTAwOTEwMDIxfQ.MsQ9sTKtvodOT_gY2z3C1UeQQJJu8YqCs9RkRKATOOc'
);

async function main() {
  console.log('🔍 Verificando buckets en Supabase Storage...');

  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    console.error('❌ Error al listar buckets:', listErr.message);
  } else {
    console.log('📋 Buckets existentes:', buckets.map(b => `${b.id} (public: ${b.public})`));
  }

  // Intentar crear el bucket 'planeaciones_pdfs' si no existe
  const exists = buckets && buckets.some(b => b.id === 'planeaciones_pdfs');
  if (!exists) {
    console.log('➕ Creando bucket "planeaciones_pdfs"...');
    const { data: newBucket, error: createErr } = await supabase.storage.createBucket('planeaciones_pdfs', {
      public: true,
      fileSizeLimit: 52428800 // 50MB
    });

    if (createErr) {
      console.error('❌ Error al crear bucket:', createErr.message);
    } else {
      console.log('✅ Bucket "planeaciones_pdfs" creado con éxito:', newBucket);
    }
  } else {
    console.log('✅ El bucket "planeaciones_pdfs" ya existe. Asegurando acceso público...');
    const { error: upErr } = await supabase.storage.updateBucket('planeaciones_pdfs', { public: true });
    if (upErr) console.error('Nota update bucket:', upErr.message);
    else console.log('✅ Bucket "planeaciones_pdfs" ahora es 100% PÚBLICO');
  }
}

main().catch(console.error);
