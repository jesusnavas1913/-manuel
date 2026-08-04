require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.storage.createBucket('planeaciones_pdfs', { public: true });
  if (error) {
    console.error('Error creando bucket:', error);
  } else {
    console.log('Bucket "planeaciones_pdfs" creado con éxito:', data);
  }
}
run();
