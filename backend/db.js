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

const DOCENTE_ALIASES = {
  'aleida lara': 'aleida ines lara castro',
  'aleida ines': 'aleida ines lara castro',
  'carlos sandoval': 'carlos de jesus sandoval penaloza',
  'martin celin': 'martin alonso celin molinares',
  'jesus': 'jesus (pruebas)',
  'jesus pruebas': 'jesus (pruebas)',
  'rocio ramirez': 'rocio del carmen ramirez montiel',
  'liliana valle': 'liliana yazmin valle rodriguez',
  'estefany verbel': 'estefany paola verbel barreto',
  'evaristo bertel': 'evaristo jose bertel beleno',
  'ibeth charris': 'ibeth esther charris celin',
  'leovigilda cuentas': 'leovigilda cuentas ariza',
  'linda varela': 'linda patricia varela rodriguez',
  'nancy vargas': 'nancy esther vargas lara',
  'roberto daza': 'roberto carlos daza angulo',
  'alex sanjuan': 'alex enrique sanjuan pachon',
  'deisy mercado': 'deisy del carmen mercado vasquez',
  'paula padilla': 'paula andrea padilla roncallo',
  'jairo benavides': 'jairo alonso benavides bustillo',
  'jairo blanco': 'jairo enrique blanco nieto',
  'jorge ferrer': 'jorge luis ferrer solano',
  'jorge luis ferrer': 'jorge luis ferrer solano',
  'jorge de la hoz': 'jorge de la hoz maldonado',
  'asterio torres': 'asterio manuel torres gamez',
  'eduardo alonso': 'eduardo rafael alonso romero'
};

function normalizeDocName(str) {
  if (!str) return '';
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCanonicalDocKey(nombre, correo) {
  const norm = normalizeDocName(nombre);
  if (!norm && correo) {
    const cleanMail = String(correo).toLowerCase().trim();
    return cleanMail.split('@')[0];
  }
  if (!norm) return 'desconocido';

  if (DOCENTE_ALIASES[norm]) return DOCENTE_ALIASES[norm];

  for (const [alias, canonical] of Object.entries(DOCENTE_ALIASES)) {
    if (norm === alias || norm === canonical) return canonical;
  }

  const tokens = norm.split(/\s+/).filter(w => w.length > 2);
  if (tokens.includes('jorge') && tokens.includes('ferrer')) return 'jorge luis ferrer solano';
  if (tokens.includes('jorge') && tokens.includes('hoz')) return 'jorge de la hoz maldonado';
  if (tokens.includes('carlos') && tokens.includes('sandoval')) return 'carlos de jesus sandoval penaloza';
  if (tokens.includes('martin') && tokens.includes('celin')) return 'martin alonso celin molinares';
  if (tokens.includes('jairo') && tokens.includes('benavides')) return 'jairo alonso benavides bustillo';
  if (tokens.includes('jairo') && tokens.includes('blanco')) return 'jairo enrique blanco nieto';
  if (tokens.includes('aleida') && tokens.includes('lara')) return 'aleida ines lara castro';
  if (tokens.includes('rocio') && tokens.includes('ramirez')) return 'rocio del carmen ramirez montiel';
  if (tokens.includes('liliana') && tokens.includes('valle')) return 'liliana yazmin valle rodriguez';
  if (tokens.includes('estefany') && tokens.includes('verbel')) return 'estefany paola verbel barreto';
  if (tokens.includes('evaristo') && tokens.includes('bertel')) return 'evaristo jose bertel beleno';
  if (tokens.includes('ibeth') && tokens.includes('charris')) return 'ibeth esther charris celin';
  if (tokens.includes('leovigilda') && tokens.includes('cuentas')) return 'leovigilda cuentas ariza';
  if (tokens.includes('linda') && tokens.includes('varela')) return 'linda patricia varela rodriguez';
  if (tokens.includes('nancy') && tokens.includes('vargas')) return 'nancy esther vargas lara';
  if (tokens.includes('roberto') && tokens.includes('daza')) return 'roberto carlos daza angulo';
  if (tokens.includes('alex') && tokens.includes('sanjuan')) return 'alex enrique sanjuan pachon';
  if (tokens.includes('deisy') && tokens.includes('mercado')) return 'deisy del carmen mercado vasquez';
  if (tokens.includes('paula') && tokens.includes('padilla')) return 'paula andrea padilla roncallo';
  if (tokens.includes('asterio') && tokens.includes('torres')) return 'asterio manuel torres gamez';
  if (tokens.includes('eduardo') && tokens.includes('alonso')) return 'eduardo rafael alonso romero';

  return norm;
}

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

      const baseMax = (maxRows && maxRows.length > 0 && maxRows[0].id) ? Number(maxRows[0].id) : 920;
      const nextId = baseMax + intentos;
      const rowWithId = { ...row, id: nextId };

      const { data, error } = await supabase
        .from('planeaciones')
        .insert([rowWithId])
        .select('*');

      if (!error) return { data, error: null };
      if (error.code !== '23505') return { data: null, error };

      // Si hubo colisión de clave primaria (23505), esperar brevemente y reintentar con nuevo MAX+intentos
      await new Promise(r => setTimeout(r, 120 * intentos));
    } catch (e) {
      if (intentos >= 5) throw e;
    }
  }

  // Fallback sin ID explícito por si PostgreSQL sequence se encuentra alineado
  return await supabase.from('planeaciones').insert([row]).select('*');
}

module.exports = {
  insertPlaneacionSegura,
  supabase,
  SEDES_MAP,
  JORNADAS_MAP,
  DOCENTE_ALIASES,
  normalizeDocName,
  getCanonicalDocKey
};
