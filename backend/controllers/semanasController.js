const { supabase } = require('../db');

// GET /api/semanas
exports.getAll = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('semanas_institucionales')
      .select('*')
      .order('anio', { ascending: false })
      .order('numero_semana', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error al obtener semanas:', err);
    res.status(500).json({ error: 'Error al obtener semanas institucionales' });
  }
};

// POST /api/semanas (solo admin)
exports.create = async (req, res) => {
  if (req.user?.rol !== 'administrador')
    return res.status(403).json({ error: 'Sin permisos' });

  const { anio, numero_semana, motivo } = req.body;
  if (!anio || !numero_semana)
    return res.status(400).json({ error: 'anio y numero_semana requeridos' });

  try {
    const { data, error } = await supabase
      .from('semanas_institucionales')
      .insert([{ anio: parseInt(anio), numero_semana: parseInt(numero_semana), motivo }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear semana institucional' });
  }
};

// DELETE /api/semanas/:id (solo admin)
exports.remove = async (req, res) => {
  if (req.user?.rol !== 'administrador')
    return res.status(403).json({ error: 'Sin permisos' });

  try {
    const { data, error } = await supabase
      .from('semanas_institucionales')
      .delete()
      .eq('id', parseInt(req.params.id))
      .select();

    if (error) throw error;
    if (!data || data.length === 0) return res.status(404).json({ error: 'No encontrada' });
    res.json({ message: 'Eliminada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar semana institucional' });
  }
};
