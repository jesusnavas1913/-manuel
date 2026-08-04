async function initCalendarioPage() {
  const user = Storage.getUser();
  const adminCard = document.getElementById('adminFormCard');
  const tableCard = document.getElementById('tableCard');

  if (user && user.rol !== 'administrador') {
    if (adminCard) adminCard.style.display = 'none';
    if (tableCard) {
      tableCard.style.gridColumn = 'span 12';
    }
  }

  const now = new Date();
  document.getElementById('anio').value = now.getFullYear();
  document.getElementById('numeroSemana').value = weekNumber(now);
  await loadSemanas();
}

async function loadSemanas() {
  try {
    const semanas = await API.Semanas.getAll();
    renderSemanas(semanas);
  } catch (err) {
    showToast('Error al cargar semanas institucionales', 'error');
  }
}

function renderSemanas(semanas) {
  const tbody = document.getElementById('semanasList');
  const user = Storage.getUser();

  if (!semanas || semanas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px;">No hay semanas institucionales registradas</td></tr>`;
    return;
  }

  tbody.innerHTML = semanas.map(s => `
    <tr>
      <td><strong>${s.anio}</strong></td>
      <td>Semana ${s.numero_semana}</td>
      <td>${s.motivo || 'Semana Institucional'}</td>
      <td style="text-align: center;">
        ${user && user.rol === 'administrador' ? `
          <button class="btn btn-danger" style="padding: 4px 10px; font-size: 12px;" onclick="deleteSemana(${s.id})">Eliminar</button>
        ` : '-'}
      </td>
    </tr>
  `).join('');
}

async function saveSemana(e) {
  e.preventDefault();
  const payload = {
    anio: parseInt(document.getElementById('anio').value),
    numero_semana: parseInt(document.getElementById('numeroSemana').value),
    motivo: document.getElementById('motivo').value.trim() || 'Semana Institucional'
  };

  try {
    await API.Semanas.create(payload);
    showToast('Semana institucional registrada', 'success');
    document.getElementById('motivo').value = '';
    await loadSemanas();
  } catch (err) {
    showToast(err.message || 'Error al crear semana institucional', 'error');
  }
}

async function deleteSemana(id) {
  if (!confirm('¿Desea eliminar esta semana institucional?')) return;
  try {
    await API.Semanas.remove(id);
    showToast('Semana eliminada', 'success');
    await loadSemanas();
  } catch (err) {
    showToast(err.message || 'Error al eliminar semana', 'error');
  }
}
