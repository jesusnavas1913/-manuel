let cachedDashboardDocentes = [];
let cachedDashboardPlans = [];
let currentSelectedDashboardWeek = null;
const EVALUACION_INICIO_SEMANA = 32;

async function initDashboard() {
  const now = new Date();
  const currentAcademicW = Math.max(36, getCurrentAcademicWeek(now));
  currentSelectedDashboardWeek = currentAcademicW;

  const currentWeekNumEl = document.getElementById('currentWeekNum');
  if (currentWeekNumEl) currentWeekNumEl.textContent = currentAcademicW;
  const currentYearEl = document.getElementById('currentYear');
  if (currentYearEl) currentYearEl.textContent = now.getFullYear();

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

  // Cargar planeaciones y docentes en paralelo
  try {
    const [plans, docs] = await Promise.all([
      API.Planeaciones.getAll().catch(e => { console.warn('Error cargando planeaciones:', e); return []; }),
      API.Docentes.getAll().catch(e => { console.warn('Error cargando docentes:', e); return []; })
    ]);

    cachedDashboardPlans = (Array.isArray(plans) ? plans : []).filter(p => p && typeof p === 'object');
    cachedDashboardDocentes = (Array.isArray(docs) ? docs : []).filter(d => d && typeof d === 'object');

    const tbody = document.getElementById('latestList');
    if (!cachedDashboardPlans || cachedDashboardPlans.length === 0) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px;">Sin entregas registradas</td></tr>`;
    } else if (tbody) {
      tbody.innerHTML = cachedDashboardPlans.slice(0, 10).map(p => `
        <tr>
          <td><strong>${p.docente_nombre || 'Docente'}</strong></td>
          <td>${p.area || '-'}</td>
          <td>${p.grado || '-'}</td>
          <td>${fmtDate(p.fecha_subida)}</td>
          <td>${badge(p.estado)}</td>
        </tr>
      `).join('');
    }

    populateDashboardWeekSelect(currentAcademicW);
    applyDashboardWeeklyMetrics(currentAcademicW);
  } catch (err) {
    console.warn('Nota al procesar panel principal:', err);
  }
}

function populateDashboardWeekSelect(activeW) {
  const sel = document.getElementById('selDashboardWeek');
  if (!sel) return;

  let optionsHtml = '';
  for (let w = activeW; w >= EVALUACION_INICIO_SEMANA; w--) {
    const isCur = w === activeW;
    const isSel = w === currentSelectedDashboardWeek;
    optionsHtml += `<option value="${w}" ${isSel ? 'selected' : ''}>Semana ${w}${isCur ? ' (Actual)' : ''}</option>`;
  }
  sel.innerHTML = optionsHtml;
}

function onDashboardWeekChange(val) {
  const w = parseInt(val);
  if (!w) return;
  currentSelectedDashboardWeek = w;
  applyDashboardWeeklyMetrics(w);
}

function applyDashboardWeeklyMetrics(targetW) {
  let okCount = 0;
  let pendingCount = 0;

  const validDocs = (cachedDashboardDocentes || []).filter(d => d && d.id !== undefined && d.id !== null);
  const validPlans = (cachedDashboardPlans || []).filter(p => p && p.docente_id !== undefined && p.docente_id !== null);

  validDocs.forEach(d => {
    const count = validPlans.filter(p => 
      String(p.docente_id) === String(d.id) && 
      parseInt(p.numero_semana) === targetW && 
      p.estado !== 'no_entrego'
    ).length;
    if (count >= 1) okCount++;
    else pendingCount++;
  });

  const dashOk = document.getElementById('dashWeekOkCount');
  if (dashOk) dashOk.textContent = okCount;

  const dashPending = document.getElementById('dashWeekPendingCount');
  if (dashPending) dashPending.textContent = pendingCount;

  renderSedesAndJornadasCharts(validDocs, validPlans, targetW);
}

function switchSedesChartView(view) {
  const btnSedes = document.getElementById('btnChartTabSedes');
  const btnJornadas = document.getElementById('btnChartTabJornadas');
  const containerSedes = document.getElementById('chartSedesContainer');
  const containerJornadas = document.getElementById('chartJornadasContainer');

  if (!btnSedes || !btnJornadas || !containerSedes || !containerJornadas) return;

  if (view === 'sedes') {
    btnSedes.className = 'btn btn-sm btn-primary';
    btnJornadas.className = 'btn btn-sm btn-light';
    containerSedes.style.display = 'grid';
    containerJornadas.style.display = 'none';
  } else {
    btnSedes.className = 'btn btn-sm btn-light';
    btnJornadas.className = 'btn btn-sm btn-primary';
    containerSedes.style.display = 'none';
    containerJornadas.style.display = 'grid';
  }
}

function renderSedesAndJornadasCharts(rawDocentes, rawPlans, currentW) {
  const containerSedes = document.getElementById('chartSedesContainer');
  const containerJornadas = document.getElementById('chartJornadasContainer');

  if (!containerSedes || !containerJornadas) return;

  const docentes = (Array.isArray(rawDocentes) ? rawDocentes : []).filter(d => d && d.id !== undefined && d.id !== null);
  const plans = (Array.isArray(rawPlans) ? rawPlans : []).filter(p => p && p.docente_id !== undefined && p.docente_id !== null);

  const sedesDef = [
    { id: 1, name: 'I.E. Guaimaral (Sede Principal)', keyName: 'guaimaral', color: '#0284c7', gradient: 'linear-gradient(135deg, #0284c7, #38bdf8)' },
    { id: 2, name: 'Sede Cuatro Bocas', keyName: 'cuatro bocas', color: '#f59e0b', gradient: 'linear-gradient(135deg, #d97706, #f59e0b)' },
    { id: 3, name: 'Sede Altamira', keyName: 'altamira', color: '#10b981', gradient: 'linear-gradient(135deg, #059669, #10b981)' }
  ];

  const jornadasDef = [
    { id: 1, name: 'Jornada Mañana', keyName: 'mañana', color: '#0284c7', gradient: 'linear-gradient(135deg, #0284c7, #38bdf8)' },
    { id: 2, name: 'Jornada Tarde', keyName: 'tarde', color: '#8b5cf6', gradient: 'linear-gradient(135deg, #7c3aed, #a78bfa)' },
    { id: 3, name: 'Jornada Nocturna', keyName: 'nocturna', color: '#ec4899', gradient: 'linear-gradient(135deg, #db2777, #f472b6)' }
  ];

  const isDocenteOk = (did) => {
    const count = plans.filter(p => 
      p &&
      String(p.docente_id) === String(did) && 
      parseInt(p.numero_semana) === currentW && 
      p.estado !== 'no_entrego'
    ).length;
    return count >= 1;
  };

  // Renderizar Sedes
  let sedesHtml = '';
  sedesDef.forEach(s => {
    const sedeDocentes = docentes.filter(d => {
      if (d.sede_id !== undefined && d.sede_id !== null) return parseInt(d.sede_id) === s.id;
      const sName = (d.sede_nombre || '').toLowerCase();
      if (s.id === 1) return !sName || sName.includes('guaimaral');
      return sName.includes(s.keyName);
    });

    const totalDoc = sedeDocentes.length;
    const okDoc = sedeDocentes.filter(d => isDocenteOk(d.id)).length;
    const pendingDoc = totalDoc - okDoc;
    const pct = totalDoc > 0 ? Math.round((okDoc / totalDoc) * 100) : 0;

    const sedeDocenteIds = new Set(sedeDocentes.map(d => String(d.id)));
    const totalPlanesSede = plans.filter(p => 
      p &&
      sedeDocenteIds.has(String(p.docente_id)) && 
      parseInt(p.numero_semana) === currentW && 
      p.estado !== 'no_entrego'
    ).length;

    // SVG Donut Chart
    const r = 36;
    const circ = 2 * Math.PI * r;
    const strokeDashoffset = circ - (pct / 100) * circ;

    sedesHtml += `
      <div style="background: var(--surface, #ffffff); border: 1px solid var(--border, #e2e8f0); border-radius: 14px; padding: 18px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; justify-content: space-between;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
          <div>
            <span style="font-size: 11px; padding: 2px 8px; border-radius: 12px; background: rgba(56,189,248,0.12); color: ${s.color}; font-weight: 700;">
              Semana ${currentW}
            </span>
            <h4 style="margin: 6px 0 2px; font-size: 15px; font-weight: 800; color: var(--text-main);">${s.name}</h4>
            <small style="color: var(--text-muted); font-size: 11.5px;">${totalDoc} Docentes Asignados</small>
          </div>

          <!-- Donut SVG Widget -->
          <div style="position: relative; width: 75px; height: 75px; flex-shrink: 0;">
            <svg width="75" height="75" viewBox="0 0 100 100" style="transform: rotate(-90deg);">
              <circle cx="50" cy="50" r="${r}" fill="transparent" stroke="var(--border, #cbd5e1)" stroke-width="12"></circle>
              <circle cx="50" cy="50" r="${r}" fill="transparent" stroke="${s.color}" stroke-width="12" 
                      stroke-dasharray="${circ}" stroke-dashoffset="${strokeDashoffset}" stroke-linecap="round"
                      style="transition: stroke-dashoffset 0.8s ease;"></circle>
            </svg>
            <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 13.5px; font-weight: 800; color: var(--text-main);">
              ${pct}%
            </div>
          </div>
        </div>

        <!-- Metrics Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; margin-bottom: 12px; background: var(--bg, #f8fafc); padding: 10px; border-radius: 10px; border: 1px solid var(--border);">
          <div>
            <span style="color: var(--text-muted); font-size: 11px; display: block;">🟢 Al Día</span>
            <strong style="color: #10b981; font-size: 14px;">${okDoc}</strong>
          </div>
          <div>
            <span style="color: var(--text-muted); font-size: 11px; display: block;">🔴 Faltantes</span>
            <strong style="color: #ef4444; font-size: 14px;">${pendingDoc}</strong>
          </div>
        </div>

        <!-- Barra de Progreso Dinámica -->
        <div>
          <div style="display: flex; justify-content: space-between; font-size: 11.5px; font-weight: 700; margin-bottom: 4px;">
            <span>Cumplimiento Docente</span>
            <span>${totalPlanesSede} planeaciones subidas</span>
          </div>
          <div style="background: var(--border, #cbd5e1); height: 8px; border-radius: 4px; overflow: hidden;">
            <div style="background: ${s.gradient}; height: 100%; width: ${pct}%; transition: width 0.6s ease;"></div>
          </div>
        </div>
      </div>
    `;
  });

  containerSedes.innerHTML = sedesHtml;

  // Renderizar Jornadas
  let jornadasHtml = '';
  jornadasDef.forEach(j => {
    const jDocentes = (docentes || []).filter(d => {
      if (d.jornada_id !== undefined && d.jornada_id !== null) return parseInt(d.jornada_id) === j.id;
      const jName = (d.jornada_nombre || '').toLowerCase();
      if (j.id === 1) return !jName || jName.includes('mañana');
      return jName.includes(j.keyName);
    });

    const totalDoc = jDocentes.length;
    const okDoc = jDocentes.filter(d => isDocenteOk(d.id)).length;
    const pendingDoc = totalDoc - okDoc;
    const jDocenteIds = new Set(jDocentes.map(d => String(d.id)));
    const totalPlanesJornada = plans.filter(p => 
      p &&
      jDocenteIds.has(String(p.docente_id)) && 
      parseInt(p.numero_semana) === currentW && 
      p.estado !== 'no_entrego'
    ).length;

    jornadasHtml += `
      <div style="background: var(--surface, #ffffff); border: 1px solid var(--border, #e2e8f0); border-radius: 14px; padding: 18px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; justify-content: space-between;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div>
            <h4 style="margin: 0; font-size: 15px; font-weight: 800; color: var(--text-main);">${j.name}</h4>
            <small style="color: var(--text-muted); font-size: 11.5px;">${totalDoc} Docentes • ${totalPlanesJornada} planeaciones</small>
          </div>
          <span style="font-size: 15px; font-weight: 800; color: ${j.color}; background: rgba(56,189,248,0.12); padding: 4px 10px; border-radius: 20px;">
            ${pct}%
          </span>
        </div>

        <div style="display: flex; gap: 10px; font-size: 12px; margin-bottom: 12px; background: var(--bg, #f8fafc); padding: 8px 12px; border-radius: 8px;">
          <span>🟢 Al Día: <strong style="color: #10b981;">${okDoc}</strong></span>
          <span style="margin-left: auto;">🔴 Pendientes: <strong style="color: #ef4444;">${pendingDoc}</strong></span>
        </div>

        <div>
          <div style="background: var(--border, #cbd5e1); height: 8px; border-radius: 4px; overflow: hidden;">
            <div style="background: ${j.gradient}; height: 100%; width: ${pct}%; transition: width 0.6s ease;"></div>
          </div>
        </div>
      </div>
    `;
  });

  containerJornadas.innerHTML = jornadasHtml;
}
