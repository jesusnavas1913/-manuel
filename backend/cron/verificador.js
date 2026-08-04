const cron = require('node-cron');
const { supabase } = require('../db');

// Función que revisa semanalmente los docentes que no entregaron
async function verificarNoEntregados() {
  console.log('⏳ Ejecutando Cron Job: Verificando planeaciones no entregadas...');
  try {
    const { data: docentes, error: errDocentes } = await supabase.from('docentes').select('id').eq('estado', 'activo');
    if (errDocentes) throw errDocentes;
    
    const ahora = new Date();
    
    // Calcular la semana ISO actual
    const fecha = new Date(ahora);
    fecha.setHours(0, 0, 0, 0);
    fecha.setDate(fecha.getDate() + 3 - ((fecha.getDay() + 6) % 7));
    const semana1 = new Date(fecha.getFullYear(), 0, 4);
    const semanaActual = 1 + Math.round(((fecha - semana1) / 86400000 - 3 + ((semana1.getDay() + 6) % 7)) / 7);

    for (let docente of (docentes || [])) {
      // Revisar si el docente tiene una planeación para esta semana
      const { data: planes, error: errPlanes } = await supabase
        .from('planeaciones')
        .select('id')
        .eq('docente_id', docente.id)
        .eq('numero_semana', semanaActual);
        
      if (errPlanes) continue;

      if (!planes || planes.length === 0) {
        // Registrar como no entregó (utiliza fecha actual para registrarlo hoy)
        const fechaAppStr = ahora.toISOString().split('T')[0];
        const dummyFileName = `no_entrego_${docente.id}_sem${semanaActual}.pdf`;
        
        await supabase
          .from('planeaciones')
          .insert([{
            docente_id: docente.id, 
            area: 'N/A', 
            grado: 'N/A', 
            fecha_aplicacion: fechaAppStr, 
            numero_semana: semanaActual, 
            nombre_archivo: dummyFileName, 
            observaciones: 'Registro automático por el sistema: No entregó la planeación correspondiente a esta semana.', 
            estado: 'no_entrego'
          }]);
        console.log(`❌ Docente ID ${docente.id} marcado como 'no_entrego' para la semana ${semanaActual}.`);
      }
    }
    console.log('✅ Cron Job finalizado exitosamente.');
  } catch (error) {
    console.error('Error en Cron Job:', error);
  }
}

// Ejecutar todos los martes a las 00:05 (hora del servidor)
function iniciarCronJobs() {
  cron.schedule('5 0 * * 2', verificarNoEntregados);
  console.log('🕒 Cron Job programado: martes 00:05.');
}

module.exports = {
  iniciarCronJobs,
  verificarNoEntregados 
};
