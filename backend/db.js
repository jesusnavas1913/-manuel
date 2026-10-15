const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://fawxjdiwtamkctrhtqzc.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhd3hqZGl3dGFta2N0cmh0cXpjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjA2ODc4MiwiZXhwIjoyMTA3NjQ0NzgyfQ.5lPcYeCBGdp_H23PaNJa8erp3CzpHRRVP-O_MlmbrZo';

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('⚡ Conectado 100% a Supabase API Nube (Nativo) (', supabaseUrl, ')');

// Mapas estáticos compartidos para resolver nombres
const SEDES_MAP = {
  1: 'I.E. Guaimaral',
  2: 'Sede Cuatro Bocas',
  3: 'Sede Altamira'
};

const JORNADAS_MAP = {
  1: 'Mañana',
  2: 'Tarde',
  3: 'Nocturna'
};

module.exports = {
  supabase,
  SEDES_MAP,
  JORNADAS_MAP
};
