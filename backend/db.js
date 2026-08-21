const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://bulrbsaoxwuibslfhlef.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1bHJic2FveHd1aWJzbGZobGVmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTMzNDAyMSwiZXhwIjoyMTAwOTEwMDIxfQ.MsQ9sTKtvodOT_gY2z3C1UeQQJJu8YqCs9RkRKATOOc';

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
