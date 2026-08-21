async function initDashboard() {
  // Semana actual
  const now = new Date();
  document.getElementById('currentWeekNum').textContent = weekNumber(now);
  document.getElementById('currentYear').textContent = now.getFullYear();

  // Cargar KPIs desde API REST
  try {
    const kpi = await API.Reportes.getKPI();
    document.getElementById('kpiDocentes').textContent = kpi.total_docentes || 0;
    document.getElementById('kpiATiempo').textContent = kpi.a_tiempo || 0;
    document.getElementById('kpiRetraso').textContent = kpi.con_retraso || 0;
    document.getElementById('kpiNoEntrego').textContent = kpi.no_entrego || 0;

    const total = (kpi.a_tiempo || 0) + (kpi.con_retraso || 0) + (kpi.no_entrego || 0);
    const pctOK = total > 0 ? Math.round(((kpi.a_tiempo || 0) / total) * 100) : 0;
    const pctLate = total > 0 ? Math.round(((kpi.con_retraso || 0) / total) * 100) : 0;
    const pctNo = total > 0 ? Math.round(((kpi.no_entrego || 0) / total) * 100) : 0;

    document.getElementById('pctATiempo').textContent = `${pctOK}% (${kpi.a_tiempo || 0})`;
    document.getElementById('barATiempo').style.width = `${pctOK}%`;

    document.getElementById('pctRetraso').textContent = `${pctLate}% (${kpi.con_retraso || 0})`;
    document.getElementById('barRetraso').style.width = `${pctLate}%`;

    document.getElementById('pctNoEntrego').textContent = `${pctNo}% (${kpi.no_entrego || 0})`;
    document.getElementById('barNoEntrego').style.width = `${pctNo}%`;
  } catch (err) {
    showToast('Error al obtener indicadores KPI', 'error');
  }

  // Cargar últimas planeaciones
  try {
    const plans = await API.Planeaciones.getAll();
    const tbody = document.getElementById('latestList');
    if (!plans || plans.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px;">Sin entregas registradas</td></tr>`;
      return;
    }

    tbody.innerHTML = plans.slice(0, 10).map(p => `
      <tr>
        <td><strong>${p.docente_nombre || 'Docente'}</strong></td>
        <td>${p.area || '-'}</td>
        <td>${p.grado || '-'}</td>
        <td>${fmtDate(p.fecha_subida)}</td>
        <td>${badge(p.estado)}</td>
      </tr>
    `).join('');
  } catch (err) {
    showToast('Error al cargar la lista de entregas', 'error');
  }
}
