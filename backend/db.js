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


/**
 * Inserta una planeación garantizando un ID incremental que no colisiona
 * con registros históricos importados por CSV (evita error duplicate key planeaciones_pkey).
 */
async function insertPlaneacionSegura(row) {
  let intentos = 0;
  while (intentos < 5) {
    intentos++;
    try {
      const { data: maxRows } = await supabase
        .from('planeaciones')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);

      const nextId = (maxRows && maxRows.length > 0 && maxRows[0].id) ? (Number(maxRows[0].id) + 1) : 921;
      const rowWithId = { ...row, id: nextId };

      const { data, error } = await supabase
        .from('planeaciones')
        .insert([rowWithId])
        .select('*');

      if (!error) return { data, error: null };
      if (error.code !== '23505') return { data: null, error };

      // Si hubo colisión de clave primaria (23505), esperar brevemente y reintentar con nuevo MAX+1
      await new Promise(r => setTimeout(r, 120));
    } catch (e) {
      if (intentos >= 5) throw e;
    }
  }

  // Fallback
  return await supabase.from('planeaciones').insert([row]).select('*');
}

module.exports = {
  insertPlaneacionSegura,
  supabase,
  SEDES_MAP,
  JORNADAS_MAP
};
