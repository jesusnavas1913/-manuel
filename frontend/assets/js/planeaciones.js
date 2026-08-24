let docentesList = [];

async function initPlaneacionesPage() {
  startLiveClock();
  populateDocenteWeekSelect();

  const user = Storage.getUser();
  const formCard = document.getElementById('formCard');
  const listCard = document.getElementById('listCard');
  const adminDocentesCard = document.getElementById('adminDocentesCard');

  if (user && user.rol === 'administrador') {
    // Administrador: Mostrar listado de Docentes con su botón de Expediente de Planeaciones
    if (formCard) formCard.style.display = 'none';
    if (listCard) listCard.style.display = 'none';
    if (adminDocentesCard) adminDocentesCard.style.display = 'block';

    await loadDocentesSelect();
    await loadAdminDocentes();

    const urlParams = new URLSearchParams(window.location.search);
    const filterParam = urlParams.get('filter');
    if (filterParam === 'pending' || filterParam === 'ok' || filterParam === 'all') {
      currentAdminDocenteFilter = filterParam;
      setAdminDocenteFilter(filterParam);
    }
  } else {
    // Docente: Mostrar formulario para registrar y tabla con sus planeaciones
    if (adminDocentesCard) adminDocentesCard.style.display = 'none';
    if (formCard) formCard.style.display = 'block';
    if (listCard) {
      listCard.style.display = 'block';
      listCard.classList.remove('c12');
      listCard.classList.add('c8');
    }
    const docenteGroup = document.getElementById('docenteGroup');
    if (docenteGroup) docenteGroup.style.display = 'none';
    await loadPlaneaciones();
  }
}

const MIN_SEMANA_LECTIVA = 32; // La implementación institucional del sistema SIGEP inició en la Semana 32
const SUPABASE_STORAGE_BUCKET_URL = 'https://bulrbsaoxwuibslfhlef.supabase.co/storage/v1/object/planeaciones_pdfs';
const SUPABASE_STORAGE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1bHJic2FveHd1aWJzbGZobGVmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTMzNDAyMSwiZXhwIjoyMTAwOTEwMDIxfQ.MsQ9sTKtvodOT_gY2z3C1UeQQJJu8YqCs9RkRKATOOc';

async function uploadPdfDirectToStorage(file) {
  const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
  const uploadUrl = `${SUPABASE_STORAGE_BUCKET_URL}/${safeName}`;

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_STORAGE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_STORAGE_ANON_KEY}`,
      'Content-Type': 'application/pdf',
      'x-upsert': 'true'
    },
    body: file
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || 'Error al subir el archivo PDF a almacenamiento');
  }

  return `https://bulrbsaoxwuibslfhlef.supabase.co/storage/v1/object/public/planeaciones_pdfs/${safeName}`;
}

function parseLocalDate(str) {
  if (!str) return new Date();
  if (str instanceof Date) return isNaN(str.getTime()) ? new Date() : str;
  if (typeof str === 'string') {
    const clean = str.split('T')[0].trim();
    // YYYY-MM-DD
    if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(clean)) {
      const parts = clean.split(/[\/\-]/);
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    // DD/MM/YYYY o DD-MM-YYYY
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(clean)) {
      const parts = clean.split(/[\/\-]/);
      return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function weekNumber(d = new Date()) {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - target) / 604800000);
}

function getCurrentAcademicWeek(d = new Date()) {
  const date = new Date(d.valueOf());
  if (date.getDay() === 0) {
    date.setDate(date.getDate() + 1);
  }
  return weekNumber(date);
}

function getMondayOfISOWeek(w, year = new Date().getFullYear()) {
  const jan4 = new Date(year, 0, 4);
  const day = jan4.getDay() || 7;
  const mondayWeek1 = new Date(year, 0, 4 - (day - 1));

  const mondayTarget = new Date(mondayWeek1);
  mondayTarget.setDate(mondayWeek1.getDate() + (w - 1) * 7);

  const yyyy = mondayTarget.getFullYear();
  const mm = String(mondayTarget.getMonth() + 1).padStart(2, '0');
  const dd = String(mondayTarget.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function populateDocenteWeekSelect() {
  const sel = document.getElementById('selSemanaDocente');
  if (!sel) return;

  const now = new Date();
  const currentW = getCurrentAcademicWeek(now);
  const user = Storage.getUser();
  // Para docente: permite desde la semana actual hasta la semana siguiente (currentW + 1) de lunes a domingo
  const maxW = (user && user.rol === 'docente') ? currentW + 1 : currentW + 1;
  const defaultW = currentW;

  let optionsHtml = '';
  for (let w = maxW; w >= MIN_SEMANA_LECTIVA; w--) {
    const isNext = w === currentW + 1;
    const isCur = w === currentW;
    let label = `Semana ${w} (Semana Anterior)`;
    if (isNext) label = `Semana ${w} (Semana Siguiente - La Semana Que Viene)`;
    else if (isCur) label = `Semana ${w} (Semana Actual - En Curso)`;

    const isSel = w === defaultW;
    optionsHtml += `<option value="${w}" ${isSel ? 'selected' : ''}>${label}</option>`;
  }

  sel.innerHTML = optionsHtml;

  const mondayDefaultStr = getMondayOfISOWeek(defaultW);
  const dateInput = document.getElementById('fechaAplicacion');
  if (dateInput) {
    dateInput.value = mondayDefaultStr;

    if (user && user.rol === 'docente') {
      const mondayMaxStr = getMondayOfISOWeek(maxW);
      const sundayMax = parseLocalDate(mondayMaxStr);
      sundayMax.setDate(sundayMax.getDate() + 6);
      const sY = sundayMax.getFullYear();
      const sM = String(sundayMax.getMonth() + 1).padStart(2, '0');
      const sD = String(sundayMax.getDate()).padStart(2, '0');
      dateInput.max = `${sY}-${sM}-${sD}`;
    }
    updateAutoSemanaHelper();
  }
}

function onSemanaDocenteChange(val) {
  const w = parseInt(val);
  if (!w) return;

  const mondayStr = getMondayOfISOWeek(w);
  const dateInput = document.getElementById('fechaAplicacion');
  if (dateInput) {
    dateInput.value = mondayStr;
    updateAutoSemanaHelper();
  }
}

let adminDocentesData = [];
let currentAdminDocenteFilter = 'all';
let selectedAdminWeek = getCurrentAcademicWeek(new Date());

async function loadAdminDocentes() {
  try {
    adminDocentesData = await API.Docentes.getAll();
    allPlaneaciones = await API.Planeaciones.getAll();
    populateAdminWeekSelect();
    updateAdminWeeklySummary();
    filterAdminDocentes();
  } catch (err) {
    showToast('Error al obtener lista de docentes', 'error');
  }
}

function populateAdminWeekSelect() {
  const sel = document.getElementById('selAdminWeek');
  if (!sel) return;

  const currentW = getCurrentAcademicWeek(new Date());
  if (!selectedAdminWeek) selectedAdminWeek = currentW;

  let optionsHtml = '';
  const maxW = Math.max(currentW, 32);
  for (let w = maxW; w >= MIN_SEMANA_LECTIVA; w--) {
    const isCur = w === currentW;
    const isSel = w === selectedAdminWeek;
    optionsHtml += `<option value="${w}" ${isSel ? 'selected' : ''}>Semana ${w}${isCur ? ' (Actual)' : ''}</option>`;
  }
  sel.innerHTML = optionsHtml;
}

function changeAdminSelectedWeek(val) {
  selectedAdminWeek = parseInt(val) || weekNumber(new Date());
  updateAdminWeeklySummary();
  filterAdminDocentes();
}

function updateAdminWeeklySummary() {
  const currentW = weekNumber(new Date());
  const targetW = selectedAdminWeek || currentW;

  const currentWeekLabel = document.getElementById('adminCurrentWeekLabel');
  if (currentWeekLabel) {
    currentWeekLabel.textContent = `Semana ${targetW}${targetW === currentW ? ' (Actual)' : ''}`;
  }

  let okCount = 0;
  let pendingCount = 0;

  adminDocentesData.forEach(d => {
    const deliveredCount = allPlaneaciones.filter(p => 
      String(p.docente_id) === String(d.id) && 
      parseInt(p.numero_semana) === targetW && 
      p.estado !== 'no_entrego'
    ).length;
    const hasWeekDelivery = deliveredCount >= 1;
    if (hasWeekDelivery) okCount++;
    else pendingCount++;
  });

  const statOk = document.getElementById('statDocentesOk');
  if (statOk) statOk.textContent = `🟢 Entregaron: ${okCount}`;

  const statPending = document.getElementById('statDocentesPending');
  if (statPending) statPending.textContent = `🔴 Sin Entregar: ${pendingCount}`;
}

function setAdminDocenteFilter(filterType) {
  currentAdminDocenteFilter = filterType;

  const btnAll = document.getElementById('btnFilterAll');
  const btnPending = document.getElementById('btnFilterPending');
  const btnOk = document.getElementById('btnFilterOk');

  if (btnAll) btnAll.className = filterType === 'all' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-light';
  if (btnPending) btnPending.className = filterType === 'pending' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-light';
  if (btnOk) btnOk.className = filterType === 'ok' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-light';

  filterAdminDocentes();
}

function filterAdminDocentes() {
  const q = (document.getElementById('searchAdminDocentes').value || '').toLowerCase().trim();
  const targetW = selectedAdminWeek || weekNumber(new Date());

  let list = adminDocentesData.filter(d => {
    const deliveredCount = allPlaneaciones.filter(p => 
      String(p.docente_id) === String(d.id) && 
      parseInt(p.numero_semana) === targetW && 
      p.estado !== 'no_entrego'
    ).length;
    const hasWeekDelivery = deliveredCount >= 1;

    if (currentAdminDocenteFilter === 'pending' && hasWeekDelivery) return false;
    if (currentAdminDocenteFilter === 'ok' && !hasWeekDelivery) return false;
    return true;
  });

  if (q) {
    list = list.filter(d => 
      (d.nombre || '').toLowerCase().includes(q) ||
      (d.correo || '').toLowerCase().includes(q) ||
      (d.sede_nombre || '').toLowerCase().includes(q) ||
      (d.jornada_nombre || '').toLowerCase().includes(q) ||
      (d.areas || '').toLowerCase().includes(q) ||
      (d.grados || '').toLowerCase().includes(q)
    );
  }

  renderAdminDocentes(list);
}

function getDocenteComplianceStats(docenteId, targetWeek) {
  const MIN_REQUERIDO = 1;
  const docPlans = allPlaneaciones.filter(p => String(p.docente_id) === String(docenteId));
  const validPlans = docPlans.filter(p => p.estado !== 'no_entrego' && parseInt(p.numero_semana) >= MIN_SEMANA_LECTIVA);
  const totalSubidas = validPlans.length;

  const weekCounts = {};
  validPlans.forEach(p => {
    const w = parseInt(p.numero_semana);
    if (w && w >= MIN_SEMANA_LECTIVA) weekCounts[w] = (weekCounts[w] || 0) + 1;
  });

  const deliveredWeeks = Object.keys(weekCounts)
    .map(Number)
    .filter(w => w >= MIN_SEMANA_LECTIVA && weekCounts[w] >= MIN_REQUERIDO)
    .sort((a, b) => a - b);

  // El sistema SIGEP inició estrictamente en la Semana 32. Jamás evaluar semanas < 32.
  const startW = MIN_SEMANA_LECTIVA;

  const missingWeeks = [];
  for (let w = startW; w <= targetWeek; w++) {
    if ((weekCounts[w] || 0) < MIN_REQUERIDO) {
      missingWeeks.push(w);
    }
  }

  const evaluatedCount = Math.max(1, targetWeek - startW + 1);
  const deliveredInRange = deliveredWeeks.filter(w => w >= startW && w <= targetWeek).length;
  const targetWeekCount = weekCounts[targetWeek] || 0;
  const hasTargetWeekDelivery = targetWeekCount >= MIN_REQUERIDO;
  const pctCumplimiento = Math.round((deliveredInRange / evaluatedCount) * 100);

  return {
    totalSubidas,
    targetWeekCount,
    deliveredWeeks,
    missingWeeks,
    hasTargetWeekDelivery,
    pctCumplimiento,
    startW
  };
}

function renderAdminDocentes(list = adminDocentesData) {
  const tbody = document.getElementById('adminDocentesList');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px; color: var(--text-muted);">No se encontraron docentes con los criterios seleccionados</td></tr>`;
    return;
  }

  const targetW = selectedAdminWeek || weekNumber(new Date());

  tbody.innerHTML = list.map(d => {
    const areasTags = d.areas ? d.areas.split(', ').map(a => `<span class="badge-tag" style="display:inline-block; margin:2px; font-size:11px; padding:3px 8px; background:rgba(56,189,248,0.15); color:var(--primary-accent,#38bdf8); border-radius:6px;">${a}</span>`).join('') : '<span style="color:var(--text-muted); font-size:12px;">Sin áreas</span>';
    const gradosTags = d.grados ? d.grados.split(', ').map(g => `<span class="badge-grade" style="display:inline-block; margin:2px; font-size:11px; padding:3px 8px; background:rgba(245,158,11,0.15); color:#f59e0b; border-radius:6px;">${g}</span>`).join('') : '<span style="color:var(--text-muted); font-size:12px;">Sin grados</span>';
    
    const stats = getDocenteComplianceStats(d.id, targetW);

    let statusSemanaHtml = '';
    if (stats.missingWeeks.length === 0) {
      statusSemanaHtml = `<span class="badge ok" style="font-size:11px; padding:4px 10px;">🟢 Al día (Sem ${targetW})</span><br><small style="color:var(--text-muted); font-size:11px;">Al día en todas las semanas (${stats.startW}-${targetW}) · Subidas: <strong>${stats.totalSubidas}</strong></small>`;
    } else if (stats.hasTargetWeekDelivery) {
      statusSemanaHtml = `<span class="badge ok" style="font-size:11px; padding:4px 10px;">🟢 Entregó (Sem ${targetW})</span><br><small style="color:#f59e0b; font-size:11px; font-weight:600;">Debe anteriores: ${stats.missingWeeks.map(w => `Sem ${w}`).join(', ')}</small>`;
    } else {
      statusSemanaHtml = `<span class="badge no" style="font-size:11px; padding:4px 10px;">🔴 Sin entrega (Sem ${targetW})</span><br><small style="color:#ef4444; font-size:11px; font-weight:600;">Faltan: ${stats.missingWeeks.map(w => `Sem ${w}`).join(', ')}</small>`;
    }

    const currentUser = Storage.getUser();
    const isOnline = currentUser && (
      (currentUser.docente_id && String(d.id) === String(currentUser.docente_id)) ||
      (currentUser.correo && d.correo && currentUser.correo.toLowerCase().trim() === d.correo.toLowerCase().trim())
    );
    const onlineDotHtml = isOnline 
      ? `<span class="pulse-dot" style="margin-right:6px;" title="🟢 En línea en la plataforma ahora mismo"></span>` 
      : ``;

    return `
      <tr style="border-bottom: 1px solid var(--border, #334155);">
        <td style="padding: 12px 10px;">
          <strong style="font-size: 13px; color: var(--text-main, #f1f5f9);">${onlineDotHtml}${d.nombre}</strong><br>
          <small style="color: var(--text-muted, #94a3b8); font-size: 11.5px;">📧 ${d.correo || 'Sin correo'}</small>
        </td>
        <td style="padding: 12px 10px;">
          <strong>${d.sede_nombre || 'I.E. Guaimaral'}</strong><br>
          <small style="color: var(--text-muted, #94a3b8);">${d.jornada_nombre || 'Mañana'}</small>
        </td>
        <td style="padding: 12px 10px; white-space: nowrap;">${statusSemanaHtml}</td>
        <td style="padding: 12px 10px; max-width: 200px;">${areasTags}</td>
        <td style="padding: 12px 10px; max-width: 130px;">${gradosTags}</td>
        <td style="text-align: center; white-space: nowrap; padding: 12px 10px;">
          <button class="btn btn-warning" onclick="loginAsDocente(${d.id}, '${(d.nombre || '').replace(/'/g, "\\'")}')" style="padding: 6px 10px; font-size: 12px; font-weight: 700; background: #f59e0b; color: #ffffff; border: none; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; margin-right: 4px;" title="Ingresar a la cuenta de este docente">
            🔑 Entrar
          </button>
          <button class="btn btn-primary" onclick="openDocenteExpedienteModal('${d.id}')" style="padding: 6px 12px; font-size: 12px; font-weight: 600; background: #0284c7; border: none; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; margin-right: 4px;">
            📁 Planeaciones ${stats.totalSubidas > 0 ? `(${stats.totalSubidas})` : ''}
          </button>
          <button class="btn btn-success" onclick="openAdminUploadModal('${d.id}')" style="padding: 6px 10px; font-size: 12px; font-weight: 700; background: #10b981; color: #ffffff; border: none; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; margin-right: 4px;" title="Subir planeación didáctica para este docente">
            ➕ Subir
          </button>
          ${!stats.hasTargetWeekDelivery ? `
            <button class="btn btn-light" onclick="notifyDocenteReminder('${d.id}')" style="padding: 6px 10px; font-size: 12px; margin-right: 4px; background: rgba(239,68,68,0.1); color: #dc2626; border: 1px solid rgba(239,68,68,0.3); font-weight: 700;">
              💬 Recordatorio
            </button>
          ` : ''}
          <button class="btn btn-light" onclick="window.location.href='docentes.html?edit=${d.id}'" style="padding: 6px 10px; font-size: 12px; margin-right: 4px;">
            ✏️ Editar
          </button>
          <button class="btn btn-danger" onclick="deleteDocenteFromAdminTable(${d.id})" style="padding: 6px 10px; font-size: 12px;">
            🗑️ Eliminar
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function openPreviewInformeModal() {
  const targetW = selectedAdminWeek || weekNumber(new Date());
  
  const docentesWithStats = adminDocentesData.map(d => {
    const stats = getDocenteComplianceStats(d.id, targetW);
    return { docente: d, stats };
  });

  const pendingRows = docentesWithStats.filter(item => !item.stats.hasTargetWeekDelivery);
  const okRows = docentesWithStats.filter(item => item.stats.hasTargetWeekDelivery);

  const currentW = weekNumber(new Date());
  const isCurrent = targetW === currentW;

  const existing = document.getElementById('previewInformeModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'previewInformeModal';
  modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.85); backdrop-filter:blur(8px); z-index:99999; display:flex; align-items:center; justify-content:center; padding:16px; animation: fadeIn 0.2s ease;';

  const broadcastMsg = `📊 *REPORTE INSTITUCIONAL DE CUMPLIMIENTO SIGEP - SEMANA ${targetW}*\n*I.E. GUAIMARAL*\n\n• Total Docentes Registrados: ${adminDocentesData.length}\n• Docentes al Día: ${okRows.length} (🟢 ${Math.round((okRows.length/adminDocentesData.length)*100 || 0)}%)\n• Docentes Pendientes: ${pendingRows.length} (🔴 ${Math.round((pendingRows.length/adminDocentesData.length)*100 || 0)}%)\n\n📌 *DOCENTES PENDIENTES DE ENTREGA (SEMANA ${targetW}):*\n${pendingRows.map((item, idx) => `${idx + 1}. *${item.docente.nombre}* (${item.docente.sede_nombre || 'I.E. Guaimaral'}) — Faltan: ${item.stats.missingWeeks.map(w => `Sem ${w}`).join(', ')}`).join('\n')}\n\nPor favor ponerse al día a la brevedad posible.`;

  modal.innerHTML = `
    <div style="background:var(--surface, #1e293b); color:var(--text-main, #f1f5f9); border-radius:18px; max-width:920px; width:96%; max-height:92vh; display:flex; flex-direction:column; box-shadow:0 25px 60px rgba(0,0,0,0.6); border:1px solid var(--border, #334155); overflow:hidden;">
      
      <!-- Topbar Header -->
      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg, #0f172a); padding:16px 22px; border-bottom:1px solid var(--border, #334155); flex-wrap:wrap; gap:10px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="font-size:26px;">📊</span>
          <div>
            <h3 style="margin:0; font-size:17px; font-weight:700; color:var(--primary-accent, #38bdf8); display:flex; align-items:center; gap:8px;">
              Previsualización de Informe · Semana ${targetW} ${isCurrent ? '<span style="font-size:11px; padding:2px 8px; background:#10b981; color:#fff; border-radius:12px; font-weight:700;">SEMANA ACTUAL</span>' : ''}
            </h3>
            <small style="color:var(--text-muted, #94a3b8); font-size:12px;">Vista previa del estado de entregas y reporte de incumplimiento docente.</small>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button type="button" onclick="exportIncumplimientoExcel()" class="btn btn-danger btn-sm" style="padding:6px 14px; font-size:12px; background:#dc2626; color:#fff; border:none; border-radius:6px; font-weight:700; cursor:pointer;">
            📥 Descargar Excel (.xls)
          </button>
          <button type="button" onclick="document.getElementById('previewInformeModal').remove()" style="background:none; border:none; font-size:26px; cursor:pointer; color:var(--text-muted); line-height:1; padding:0 6px;">&times;</button>
        </div>
      </div>

      <!-- Body Content -->
      <div style="flex:1; padding:22px; overflow-y:auto; background:var(--surface, #1e293b); display:flex; flex-direction:column; gap:20px;">
        
        <!-- Metric Cards Grid -->
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap:14px;">
          <div style="background:var(--bg, #0f172a); border:1px solid var(--border, #334155); border-radius:12px; padding:12px 16px;">
            <small style="color:var(--text-muted); font-size:11.5px; font-weight:600;">👨‍🏫 Total Docentes Activos</small>
            <div style="font-size:22px; font-weight:800; color:var(--text-main); margin-top:2px;">${adminDocentesData.length}</div>
          </div>
          <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:12px; padding:12px 16px;">
            <small style="color:#10b981; font-size:11.5px; font-weight:700;">🟢 Entregaron esta Semana</small>
            <div style="font-size:22px; font-weight:800; color:#10b981; margin-top:2px;">${okRows.length} (${Math.round((okRows.length/adminDocentesData.length)*100 || 0)}%)</div>
          </div>
          <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:12px; padding:12px 16px;">
            <small style="color:#ef4444; font-size:11.5px; font-weight:700;">🔴 Faltan por Entregar</small>
            <div style="font-size:22px; font-weight:800; color:#ef4444; margin-top:2px;">${pendingRows.length} (${Math.round((pendingRows.length/adminDocentesData.length)*100 || 0)}%)</div>
          </div>
        </div>

        <!-- Table of Pending Teachers -->
        <div>
          <h4 style="margin:0 0 10px; font-size:14px; font-weight:700; color:#ef4444; display:flex; align-items:center; gap:6px;">
            🔴 Listado de Docentes Pendientes (Semana ${targetW})
          </h4>
          <div style="border:1px solid var(--border, #334155); border-radius:10px; overflow:hidden;">
            <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
              <thead>
                <tr style="background:var(--bg, #0f172a); text-align:left; color:var(--text-muted);">
                  <th style="padding:10px;">Docente / Contacto</th>
                  <th style="padding:10px;">Sede / Jornada</th>
                  <th style="padding:10px; text-align:center;">Subidas Totales</th>
                  <th style="padding:10px;">Semanas Pendientes</th>
                  <th style="padding:10px; text-align:center;">% Cumplimiento</th>
                </tr>
              </thead>
              <tbody>
                ${pendingRows.length > 0 ? pendingRows.map(item => {
                  const currentUser = Storage.getUser();
                  const isOnline = currentUser && (
                    (currentUser.docente_id && String(item.docente.id) === String(currentUser.docente_id)) ||
                    (currentUser.correo && item.docente.correo && currentUser.correo.toLowerCase().trim() === item.docente.correo.toLowerCase().trim())
                  );
                  const onlineDotHtml = isOnline ? `<span class="pulse-dot" style="margin-right:6px;" title="🟢 En línea en la plataforma ahora mismo"></span>` : ``;

                  return `
                  <tr style="border-bottom:1px solid var(--border, #334155);">
                    <td style="padding:10px;">
                      <strong>${onlineDotHtml}${item.docente.nombre}</strong><br>
                      <small style="color:var(--text-muted);">${item.docente.correo || 'Sin correo'}</small>
                    </td>
                    <td style="padding:10px;">
                      ${item.docente.sede_nombre || 'I.E. Guaimaral'}<br>
                      <small style="color:var(--text-muted);">${item.docente.jornada_nombre || 'Mañana'}</small>
                    </td>
                    <td style="padding:10px; text-align:center;"><b>${item.stats.totalSubidas}</b></td>
                    <td style="padding:10px; color:#ef4444; font-weight:700;">
                      ${item.stats.missingWeeks.map(w => `<span style="background:rgba(239,68,68,0.15); padding:2px 6px; border-radius:6px; margin-right:3px; display:inline-block;">Sem ${w}</span>`).join('')}
                    </td>
                    <td style="padding:10px; text-align:center;"><b>${item.stats.pctCumplimiento}%</b></td>
                  </tr>
                `).join('') : `<tr><td colspan="5" style="text-align:center; padding:20px; color:#10b981; font-weight:700;">🎉 ¡Excelente! No hay docentes pendientes en la Semana ${targetW}.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Broadcast Message Textarea -->
        <div style="background:var(--bg, #0f172a); border:1px solid var(--border, #334155); border-radius:12px; padding:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <label style="font-size:12px; font-weight:700; color:var(--primary-accent);">📋 Plantilla de Comunicado Institucional para Copiar o Difusión:</label>
            <button type="button" class="btn btn-light btn-sm" onclick="navigator.clipboard.writeText(\`${broadcastMsg.replace(/`/g, '\\`')}\`); showToast('✅ Comunicado copiado al portapapeles', 'success');" style="padding:3px 10px; font-size:11px;">
              📋 Copiar Comunicado
            </button>
          </div>
          <textarea readonly style="width:100%; height:120px; background:transparent; border:none; color:inherit; font-family:inherit; font-size:12px; resize:none; outline:none;">${broadcastMsg}</textarea>
        </div>

      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

function notifyDocenteReminder(docenteId) {
  const d = adminDocentesData.find(item => String(item.id) === String(docenteId));
  if (!d) return;

  const targetW = selectedAdminWeek || weekNumber(new Date());
  const stats = getDocenteComplianceStats(d.id, targetW);

  const missingStr = stats.missingWeeks.length > 0 ? stats.missingWeeks.map(w => `Semana ${w}`).join(', ') : `Semana ${targetW}`;

  const msg = `Estimado(a) Docente ${d.nombre}:\nLe recordamos cordialmente que registra pendiente la entrega de sus planeaciones didácticas en el sistema SIGEP (I.E. Guaimaral).\n\n📊 Resumen de Cumplimiento:\n• Semanas pendientes por entregar: ${missingStr}\n• Archivos subidos en total: ${stats.totalSubidas} planeación(es)\n• Cumplimiento actual: ${stats.pctCumplimiento}%\n\nPor favor realice la carga de sus archivos PDF a la brevedad posible.\n¡Muchas gracias!`;

  const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;

  const existing = document.getElementById('reminderModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'reminderModal';
  modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.85); backdrop-filter:blur(6px); z-index:99999; display:flex; align-items:center; justify-content:center; padding:16px;';
  modal.innerHTML = `
    <div style="background:var(--surface, #1e293b); color:var(--text-main, #f1f5f9); border-radius:16px; padding:24px; max-width:520px; width:95%; box-shadow:0 20px 50px rgba(0,0,0,0.5); border:1px solid var(--border, #334155);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="margin:0; font-size:16.5px; font-weight:700; color:#ef4444; display:flex; align-items:center; gap:8px;">
          💬 Notificación de Recordatorio · Semana ${targetW}
        </h3>
        <button type="button" onclick="document.getElementById('reminderModal').remove()" style="background:none; border:none; font-size:22px; cursor:pointer; color:var(--text-muted);">&times;</button>
      </div>

      <p style="font-size:13px; color:var(--text-muted); margin-bottom:12px;">Docente: <strong>${d.nombre}</strong> (Sede: ${d.sede_nombre || 'I.E. Guaimaral'})</p>

      <div style="background:var(--bg, #0f172a); border:1px solid var(--border, #334155); border-radius:10px; padding:14px; margin-bottom:20px;">
        <label style="font-size:11.5px; font-weight:700; color:var(--primary-accent); display:block; margin-bottom:6px;">Mensaje de Recordatorio Generado:</label>
        <textarea readonly style="width:100%; height:130px; background:transparent; border:none; color:inherit; font-family:inherit; font-size:12.5px; resize:none; outline:none;">${msg}</textarea>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap;">
        <button type="button" class="btn btn-light" onclick="navigator.clipboard.writeText(\`${msg.replace(/`/g, '\\`')}\`); showToast('✅ Texto copiado al portapapeles', 'success');">
          📋 Copiar Texto
        </button>
        <a href="${waUrl}" target="_blank" class="btn btn-success" style="background:#25D366; border:none; color:#fff; font-weight:700; display:inline-flex; align-items:center; gap:6px; text-decoration:none; padding:8px 16px; border-radius:8px; font-size:12.5px;">
          💬 Abrir en WhatsApp
        </a>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

function exportIncumplimientoExcel() {
  const targetW = selectedAdminWeek || weekNumber(new Date());
  
  const docentesWithStats = adminDocentesData.map(d => {
    const stats = getDocenteComplianceStats(d.id, targetW);
    return { docente: d, stats };
  });

  const pendingRows = docentesWithStats.filter(item => !item.stats.hasTargetWeekDelivery);

  if (pendingRows.length === 0) {
    showToast(`✅ No hay docentes pendientes de entrega para la Semana ${targetW}`, 'success');
    return;
  }

  const now = new Date();
  const fechaGen = now.toLocaleString('es-CO');

  const excelContent = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<style>
body { font-family: Arial, sans-serif; font-size: 11pt; }
.title-main { background-color: #091e3a; color: #ffffff; font-size: 16pt; font-weight: bold; text-align: center; height: 45px; vertical-align: middle; }
.title-sub { background-color: #dc2626; color: #ffffff; font-size: 11pt; font-weight: bold; text-align: center; height: 28px; vertical-align: middle; }
.meta-label { font-weight: bold; background-color: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1; padding: 6px; }
.meta-val { background-color: #ffffff; color: #334155; border: 1px solid #cbd5e1; padding: 6px; }
th { background-color: #091e3a; color: #ffffff; font-weight: bold; font-size: 10pt; border: 1px solid #091e3a; text-align: center; height: 35px; vertical-align: middle; }
td { border: 1px solid #cbd5e1; font-size: 9.5pt; vertical-align: middle; padding: 6px 10px; }
tr:nth-child(even) td { background-color: #f8fafc; }
.badge-no { background-color: #fee2e2; color: #991b1b; font-weight: bold; text-align: center; }
.text-missing { color: #dc2626; font-weight: bold; }
.text-ok { color: #166534; font-weight: bold; }
</style>
</head>
<body>
<table>
<tr><td colspan="10" class="title-main">INSTITUCIÓN EDUCATIVA GUAIMARAL</td></tr>
<tr><td colspan="10" class="title-sub">INFORME EJECUTIVO DETALLADO DE CUMPLIMIENTO E INCUMPLIMIENTO DOCENTE · SEMANA ${targetW}</td></tr>
<tr><td colspan="10" style="height: 10px; border:none;"></td></tr>

<tr>
  <td colspan="2" class="meta-label">Fecha de Generación:</td>
  <td colspan="3" class="meta-val">${fechaGen}</td>
  <td colspan="2" class="meta-label">Semana Evaluada:</td>
  <td colspan="3" class="meta-val"><b>Semana ${targetW}</b></td>
</tr>
<tr>
  <td colspan="2" class="meta-label">Total Docentes Registrados:</td>
  <td colspan="3" class="meta-val">${adminDocentesData.length} Docentes</td>
  <td colspan="2" class="meta-label">Total Faltantes esta Semana:</td>
  <td colspan="3" class="meta-val"><b style="color:#dc2626;">${pendingRows.length} Docentes Pendientes</b></td>
</tr>
<tr><td colspan="10" style="height: 14px; border:none;"></td></tr>

<thead>
  <tr>
    <th>#</th>
    <th>Nombre del Docente</th>
    <th>Documento</th>
    <th>Correo Electrónico</th>
    <th>Sede / Jornada</th>
    <th>Archivos Subidos en Total</th>
    <th>Semanas ENTREGADAS</th>
    <th>Semanas PENDIENTES (Sin Entregar)</th>
    <th>% Cumplimiento</th>
    <th>Estado Semana ${targetW}</th>
  </tr>
</thead>
<tbody>
  ${pendingRows.map((item, i) => {
    const d = item.docente;
    const s = item.stats;
    const deliveredStr = s.deliveredWeeks.length > 0 ? s.deliveredWeeks.map(w => `Sem ${w}`).join(', ') : 'Ninguna';
    const missingStr = s.missingWeeks.length > 0 ? s.missingWeeks.map(w => `Sem ${w}`).join(', ') : 'Ninguna';

    return `
      <tr>
        <td style="text-align:center;"><b>${i + 1}</b></td>
        <td><b>${d.nombre || '-'}</b></td>
        <td style="text-align:center;">${d.documento || '-'}</td>
        <td>${d.correo || '-'}</td>
        <td>${d.sede_nombre || 'I.E. Guaimaral'} (${d.jornada_nombre || 'Mañana'})</td>
        <td style="text-align:center;"><b>${s.totalSubidas} planeación(es)</b></td>
        <td class="text-ok">${deliveredStr}</td>
        <td class="text-missing">${missingStr}</td>
        <td style="text-align:center;"><b>${s.pctCumplimiento}%</b></td>
        <td class="badge-no">🔴 Sin Entregar</td>
      </tr>
    `;
  }).join('')}
</tbody>
</table>
</body>
</html>
  `;

  const blob = new Blob(['\ufeff' + excelContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `informe_incumplimiento_detallado_semana_${targetW}_${new Date().toISOString().slice(0, 10)}.xls`;
  link.click();
  showToast(`✅ Informe detallado de ${pendingRows.length} docentes faltantes descargado en Excel (.xls)`, 'success');
}

async function deleteDocenteFromAdminTable(id) {
  if (!confirm('⚠️ ¿Está seguro de eliminar este docente? Se eliminarán también sus planeaciones asociadas del sistema.')) return;
  try {
    if (API.Docentes.remove) {
      await API.Docentes.remove(id);
    } else {
      await API.Docentes.delete(id);
    }
    showToast('✅ Docente y sus registros eliminados correctamente', 'success');
    await loadAdminDocentes();
  } catch (err) {
    showToast('Error al eliminar docente: ' + (err.message || ''), 'error');
  }
}

function openDocenteExpedienteModal(docenteId) {
  const plans = allPlaneaciones.filter(p => String(p.docente_id) === String(docenteId));
  const doc = adminDocentesData.find(d => String(d.id) === String(docenteId)) || (plans.length > 0 ? { nombre: plans[0].docente_nombre, sede_nombre: plans[0].sede_nombre, jornada_nombre: plans[0].jornada_nombre } : null);
  const docName = doc ? doc.nombre : 'Docente';

  const docSede = (doc && doc.sede_nombre) || (plans.length > 0 && plans[0].sede_nombre) || 'I.E. Guaimaral';
  const docJornada = (doc && doc.jornada_nombre) || (plans.length > 0 && plans[0].jornada_nombre) || 'Mañana';
  const docCorreo = (doc && doc.correo) || '--';

  const existing = document.getElementById('docenteExpedienteModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'docenteExpedienteModal';
  modal.setAttribute('data-docente-id', docenteId);
  modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.85); backdrop-filter:blur(6px); z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:16px; animation: fadeIn 0.2s ease;';

  const hasPlans = plans && plans.length > 0;

  modal.innerHTML = `
    <div style="background:var(--surface, #1e293b); color:var(--text-main, #f1f5f9); border-radius:16px; max-width:1100px; width:96%; max-height:90vh; display:flex; flex-direction:column; box-shadow: 0 25px 60px rgba(0,0,0,0.5); border:1px solid var(--border, #334155); overflow:hidden;">
      
      <!-- Topbar Header -->
      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg, #0f172a); padding:16px 22px; border-bottom:1px solid var(--border, #334155); flex-wrap:wrap; gap:10px;">
        <div style="display:flex; align-items:center; gap:14px;">
          <div style="width:46px; height:46px; border-radius:50%; background:linear-gradient(135deg, #0284c7, #38bdf8); color:#fff; display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:bold;">
            ${(docName || 'D').charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 style="margin:0; font-size:18px; font-weight:700; color:var(--primary-accent, #38bdf8);">
              Expediente de Planeaciones · ${docName}
            </h3>
            <small style="color:var(--text-muted, #94a3b8); font-size:12px;">
              Correo: ${docCorreo} · Sede: ${docSede} · Jornada: ${docJornada}
            </small>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <button type="button" class="btn btn-success" onclick="openAdminUploadModal('${docenteId}')" style="padding: 5px 12px; font-size: 12px; font-weight: 700; background: #10b981; border: none; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
            ➕ Subir Planeación
          </button>
          <span style="font-size:12px; padding:4px 12px; background:rgba(56,189,248,0.15); color:#38bdf8; border-radius:20px; font-weight:600;">
            📁 ${plans.length} ${plans.length === 1 ? 'Planeación' : 'Planeaciones'}
          </span>
          <button type="button" onclick="document.getElementById('docenteExpedienteModal').remove()" style="background:none; border:none; font-size:26px; cursor:pointer; color:var(--text-muted, #94a3b8); line-height:1; padding:0 6px;">&times;</button>
        </div>
      </div>

      <!-- Body Table -->
      <div style="flex:1; padding:20px; overflow-y:auto; background:var(--surface, #1e293b);">
        ${!hasPlans ? `
          <div style="text-align:center; padding: 50px 20px; color: var(--text-muted, #94a3b8);">
            <span style="font-size: 48px; display: block; margin-bottom: 12px; opacity: 0.8;">📂</span>
            <h4 style="margin: 0 0 8px 0; font-size: 16px; color: var(--text-main, #f1f5f9);">Este docente aún no ha registrado planeaciones didácticas</h4>
            <p style="margin: 0 0 20px 0; font-size: 13px;">Puede registrar y adjuntar la planeación correspondiente en nombre del docente desde este botón:</p>
            <button type="button" class="btn btn-success" onclick="openAdminUploadModal('${docenteId}')" style="padding: 10px 22px; font-size: 13.5px; font-weight: 700; background: #10b981; color: #fff; border: none; border-radius: 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;">
              ➕ Subir Primera Planeación para ${docName}
            </button>
          </div>
        ` : `
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead>
              <tr style="border-bottom:1.5px solid var(--border, #334155); text-align:left; color:var(--text-muted);">
                <th style="padding:10px;">Área / Grado</th>
                <th style="padding:10px;">Semana</th>
                <th style="padding:10px;">Fecha Aplicación</th>
                <th style="padding:10px;">Subida</th>
                <th style="padding:10px;">Estado</th>
                <th style="padding:10px; text-align:center;">Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${(() => {
                const currentWeek = weekNumber(new Date());
                const grouped = groupPlansByWeek(plans);
                let modalHtml = '';
                grouped.forEach(({ semana, items }) => {
                  const isCurrent = semana === currentWeek;
                  modalHtml += `
                    <tr style="background: var(--bg, rgba(56,189,248,0.08)); border-top: 2px solid var(--primary-accent, #38bdf8); border-bottom: 1px solid var(--border, #334155);">
                      <td colspan="6" style="padding: 8px 12px; font-weight: 700; color: var(--primary-accent, #38bdf8); font-size: 13px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
                          <span style="display: flex; align-items: center; gap: 8px;">
                            🗓️ <strong>SEMANA ${semana}</strong>
                            ${isCurrent ? '<span style="font-size:10px; background:#10b981; color:#fff; padding:2px 6px; border-radius:10px; font-weight:700;">SEMANA ACTUAL</span>' : ''}
                          </span>
                          <span style="font-size: 11px; background: rgba(56,189,248,0.15); color: var(--primary-accent, #38bdf8); padding: 2px 8px; border-radius: 10px; font-weight: 600;">
                            📁 ${items.length} ${items.length === 1 ? 'Planeación' : 'Planeaciones'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  `;
                  items.forEach(p => {
                    const pdfUrl = getPdfUrl(p);
                    const cleanName = getCleanPdfFileName(p);
                    modalHtml += `
                      <tr style="border-bottom:1px solid var(--border, #334155);">
                        <td style="padding:10px;"><strong>${p.area || '-'}</strong><br><small style="color:var(--text-muted);">${p.grado || '-'}</small></td>
                        <td style="padding:10px;">Semana ${p.numero_semana || '-'}</td>
                        <td style="padding:10px;">${p.fecha_aplicacion ? new Date(p.fecha_aplicacion).toLocaleDateString('es-CO') : '-'}</td>
                        <td style="padding:10px; font-size:11px;">${fmtDate(p.fecha_subida)}</td>
                        <td style="padding:10px;">${badge(p.estado)}</td>
                        <td style="padding:10px; text-align:center; white-space:nowrap;">
                          ${pdfUrl ? `
                            <button class="btn btn-primary" style="padding:4px 8px; font-size:11px; margin-right:4px; background:#0284c7;" onclick="openPdfViewerModal(${p.id})">📄 Ver PDF</button>
                            <button class="btn btn-success" style="padding:4px 8px; font-size:11px; margin-right:4px; background:#10b981; color:#fff;" onclick="downloadPdfFile(${p.id}, '${pdfUrl}', '${cleanName}')">📥 Descargar</button>
                          ` : ''}
                          <button class="btn btn-light" style="padding:4px 8px; font-size:11px; margin-right:4px;" onclick="viewPlanDetail(${p.id})">🔍 Detalle</button>
                          <button class="btn btn-danger" style="padding:4px 8px; font-size:11px;" onclick="deletePlaneacion(${p.id})">🗑️ Eliminar</button>
                        </td>
                      </tr>
                    `;
                  });
                });
                return modalHtml;
              })()}
            </tbody>
          </table>
        `}
      </div>

    </div>
  `;

  document.body.appendChild(modal);
}

function startLiveClock() {
  const el = document.getElementById('lblLiveClock');
  if (!el) return;
  const update = () => {
    const now = new Date();
    el.innerText = now.toLocaleDateString('es-CO', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) + ' · ' + now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  update();
  setInterval(update, 1000);
}

function updateAutoSemanaHelper() {
  const val = document.getElementById('fechaAplicacion').value;
  const helper = document.getElementById('semanaAutoHelper');
  if (!val) {
    if (helper) helper.innerHTML = '';
    return;
  }
  const dateObj = parseLocalDate(val);
  const w = weekNumber(dateObj);
  const now = new Date();
  const currentW = weekNumber(now);
  const dayNow = now.getDay();
  const isWeekend = (dayNow === 0 || dayNow === 6 || (dayNow === 5 && now.getHours() >= 18));
  const user = Storage.getUser();

  // Sincronizar el selector selSemanaDocente si existe
  const selDoc = document.getElementById('selSemanaDocente');
  if (selDoc && selDoc.querySelector(`option[value="${w}"]`)) {
    selDoc.value = w;
  }

  let statusBadge = '';
  if (w < currentW) {
    statusBadge = `<span style="background:rgba(217,119,6,0.18); color:#d97706; padding:2px 8px; border-radius:10px; font-weight:700; font-size:11px;">🟡 Entrega Atrasada (Se registrará Con Retraso)</span>`;
  } else if (w === currentW) {
    statusBadge = `<span style="background:rgba(16,185,129,0.18); color:#10b981; padding:2px 8px; border-radius:10px; font-weight:700; font-size:11px;">🟢 Semana Actual (Entrega A Tiempo)</span>`;
  } else if (w === currentW + 1) {
    statusBadge = `<span style="background:rgba(16,185,129,0.18); color:#10b981; padding:2px 8px; border-radius:10px; font-weight:700; font-size:11px;">🟢 Semana Siguiente / La Que Viene (Entrega Habilitada)</span>`;
  } else {
    if (user && user.rol === 'docente') {
      statusBadge = `<span style="background:rgba(239,68,68,0.2); color:#ef4444; padding:2px 8px; border-radius:10px; font-weight:700; font-size:11px;">🚫 RESTRICCIÓN DE SEGURIDAD: No se permiten planeaciones a más de 1 semana de antelación (Máximo Semana ${currentW + 1})</span>`;
    } else {
      statusBadge = `<span style="background:rgba(56,189,248,0.18); color:#0284c7; padding:2px 8px; border-radius:10px; font-weight:700; font-size:11px;">🔵 Semana Adelantada (Modo Admin)</span>`;
    }
  }

  if (helper) {
    helper.innerHTML = `<div style="margin-top:6px; font-size:12px; font-weight:600; color:var(--primary-accent); display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
      <span>🗓️ Semana ISO: <strong>Semana ${w}</strong></span>
      ${statusBadge}
    </div>`;
  }
}

async function loadDocentesSelect() {
  try {
    docentesList = await API.Docentes.getAll();
    const sel = document.getElementById('docenteId');
    sel.innerHTML = '<option value="">Seleccione docente...</option>' + 
      docentesList.map(d => `<option value="${d.id}">${d.nombre} (${d.sede_nombre || 'Sin Sede'})</option>`).join('');
  } catch (err) {
    showToast('Error al cargar docentes', 'error');
  }
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  const dz = document.getElementById('pdfDropzone') || document.getElementById('dropZone');
  if (dz) dz.style.background = 'rgba(56,189,248,0.15)';
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  const dz = document.getElementById('pdfDropzone') || document.getElementById('dropZone');
  if (dz) dz.style.background = 'rgba(56,189,248,0.04)';
}

function handleFileDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const dz = document.getElementById('pdfDropzone') || document.getElementById('dropZone');
  if (dz) dz.style.background = 'rgba(56,189,248,0.04)';

  const files = e.dataTransfer ? e.dataTransfer.files : null;
  if (!files || files.length === 0) return;

  const input = document.getElementById('archivo');
  if (input) {
    input.files = files;
    handleFileChange({ target: input });
  }
}

function updateFileUI(file) {
  const badge = document.getElementById('selectedFileBadge');
  const content = document.getElementById('dropzoneContent') || document.getElementById('dropZoneContent');
  const nameLabel = document.getElementById('fileNameLabel');
  const sizeLabel = document.getElementById('fileSizeLabel');

  if (file && badge && content && nameLabel && sizeLabel) {
    nameLabel.textContent = file.name;
    sizeLabel.textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
    badge.style.display = 'flex';
    content.style.display = 'none';
  } else if (badge && content) {
    badge.style.display = 'none';
    content.style.display = 'block';
  }
}

function clearSelectedFile(e) {
  if (e) e.stopPropagation();
  const input = document.getElementById('archivo');
  if (input) input.value = '';
  const hidden = document.getElementById('nombreArchivo');
  if (hidden) hidden.value = '';
  updateFileUI(null);
}

function handleFileChange(e) {
  const file = e.target.files[0];
  if (!file) {
    updateFileUI(null);
    return;
  }

  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  if (!isPdf) {
    showToast('⚠️ Formato no permitido. Únicamente se aceptan archivos PDF (.pdf)', 'error');
    clearSelectedFile();
    return;
  }

  const MAX_MB = 50;
  const maxBytes = MAX_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    showToast(`⚠️ El archivo pesa ${sizeMB} MB. El límite máximo de peso es de ${MAX_MB} MB.`, 'error');
    clearSelectedFile();
    return;
  }

  document.getElementById('nombreArchivo').value = file.name;
  updateFileUI(file);
  showToast(`✅ Archivo PDF preparado (${(file.size / (1024 * 1024)).toFixed(1)} MB)`, 'success');
}

let allPlaneaciones = [];

async function loadPlaneaciones() {
  try {
    allPlaneaciones = await API.Planeaciones.getAll();
    renderDocenteAlertBanner(allPlaneaciones);
    renderPlaneaciones(allPlaneaciones);
  } catch (err) {
    showToast('Error al obtener planeaciones', 'error');
  }
}

function renderDocenteAlertBanner(plans) {
  const banner = document.getElementById('docenteAlertBanner');
  if (!banner) return;

  const user = Storage.getUser();
  if (user && user.rol === 'administrador') {
    banner.style.display = 'none';
    return;
  }

  const currentW = weekNumber(new Date());

  const validPlans = (plans || []).filter(p => p.estado !== 'no_entrego');
  const currentWeekPlansCount = validPlans.filter(p => parseInt(p.numero_semana) === currentW).length;
  const hasSubmittedCurrentWeek = currentWeekPlansCount >= 1;

  const noEntregoWeeks = (plans || [])
    .filter(p => p.estado === 'no_entrego' && parseInt(p.numero_semana) >= MIN_SEMANA_LECTIVA)
    .map(p => parseInt(p.numero_semana))
    .filter((w, idx, self) => self.indexOf(w) === idx)
    .sort((a, b) => b - a);

  let pendingWeeks = [...noEntregoWeeks];
  if (currentW >= MIN_SEMANA_LECTIVA && !hasSubmittedCurrentWeek && !pendingWeeks.includes(currentW)) {
    pendingWeeks.unshift(currentW);
  }
  pendingWeeks = pendingWeeks.filter(w => w >= MIN_SEMANA_LECTIVA);

  if (pendingWeeks.length > 0) {
    banner.style.display = 'block';
    banner.innerHTML = `
      <div style="background: linear-gradient(135deg, rgba(239,68,68,0.12), rgba(217,119,6,0.12)); border: 1.5px solid #ef4444; border-radius: 14px; padding: 14px 20px; color: var(--text-main); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; box-shadow: 0 4px 15px rgba(239,68,68,0.08);">
        <div style="display: flex; align-items: center; gap: 14px;">
          <div style="width: 42px; height: 42px; border-radius: 50%; background: #ef4444; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: bold; flex-shrink: 0;">
            ⚠️
          </div>
          <div>
            <h4 style="margin: 0; font-size: 15px; font-weight: 700; color: #dc2626;">
              Atención: Tienes semanas pendientes por entregar planeación
            </h4>
            <p style="margin: 2px 0 0; font-size: 13px; color: var(--text-muted);">
              Semanas pendientes: ${pendingWeeks.map(w => `<strong style="color:#dc2626; background:rgba(220,38,38,0.15); padding:1px 8px; border-radius:6px; margin:0 2px;">Semana ${w}</strong>`).join('')}
              <br><small style="color:var(--primary-accent); font-size:11.5px; font-weight:600; display:inline-block; margin-top:3px;">📌 En la Semana ${currentW} llevas <strong>${currentWeekPlansCount}</strong> ${currentWeekPlansCount === 1 ? 'planeación registrada' : 'planeaciones registradas'}.</small>
            </p>
          </div>
        </div>
        <button type="button" class="btn btn-primary" onclick="document.getElementById('fechaAplicacion').focus();" style="background: #dc2626; border: none; font-weight: 700; font-size: 12px; padding: 8px 16px; border-radius: 8px;">
          📤 Subir Planeación Pendiente
        </button>
      </div>
    `;
  } else {
    banner.style.display = 'block';
    banner.innerHTML = `
      <div style="background: linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,150,105,0.08)); border: 1.5px solid #10b981; border-radius: 14px; padding: 12px 20px; color: var(--text-main); display: flex; align-items: center; gap: 14px;">
        <div style="width: 38px; height: 38px; border-radius: 50%; background: #10b981; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold; flex-shrink: 0;">
          ✅
        </div>
        <div>
          <h4 style="margin: 0; font-size: 14px; font-weight: 700; color: #059669;">
            ¡Excelente! Estás al día con tus entregas
          </h4>
          <p style="margin: 2px 0 0; font-size: 12.5px; color: var(--text-muted);">
            Has registrado tus planeaciones para la <strong>Semana ${currentW}</strong> (${currentWeekPlansCount} ${currentWeekPlansCount === 1 ? 'planeación' : 'planeaciones'}). No registras faltas pendientes.
          </p>
        </div>
      </div>
    `;
  }
}

function filterPlaneaciones() {
  const q = (document.getElementById('searchPlaneaciones').value || '').toLowerCase().trim();
  if (!q) {
    renderPlaneaciones(allPlaneaciones);
    return;
  }
  const filtered = allPlaneaciones.filter(p => 
    (p.docente_nombre || '').toLowerCase().includes(q) ||
    (p.area || '').toLowerCase().includes(q) ||
    (p.grado || '').toLowerCase().includes(q) ||
    (p.nombre_archivo || '').toLowerCase().includes(q) ||
    (p.sede_nombre || '').toLowerCase().includes(q)
  );
  renderPlaneaciones(filtered);
}

function getPdfUrl(plan) {
  if (!plan || !plan.nombre_archivo) return null;
  if (plan.nombre_archivo.startsWith('http://') || plan.nombre_archivo.startsWith('https://')) {
    return plan.nombre_archivo;
  }
  // Construir URL pública de Supabase Storage para archivos guardados solo por nombre
  return `https://bulrbsaoxwuibslfhlef.supabase.co/storage/v1/object/public/planeaciones_pdfs/${plan.nombre_archivo}`;
}

function getCleanPdfFileName(plan) {
  if (!plan) return 'Planeacion_Didactica.pdf';
  if (plan.nombre_archivo) {
    const raw = plan.nombre_archivo.split('/').pop().split('?')[0];
    const clean = raw.replace(/^\d+_[_\-]*/, '');
    if (clean && clean.toLowerCase().endsWith('.pdf')) return clean;
  }
  const area = (plan.area || 'Planeacion').replace(/[^a-zA-Z0-9]/g, '_');
  const docente = (plan.docente_nombre || 'Docente').replace(/[^a-zA-Z0-9]/g, '_');
  return `Planeacion_${area}_${docente}.pdf`;
}

function downloadPdfFile(planId, fallbackUrl, filename) {
  const downloadUrl = planId ? `${API_BASE}/planeaciones/${planId}/descargar` : fallbackUrl;
  if (!downloadUrl) {
    showToast('⚠️ No hay un archivo PDF válido disponible.', 'error');
    return;
  }
  showToast('⏳ Descargando planeación PDF...', 'info');

  const windowRef = window.open(downloadUrl, '_blank');
  if (!windowRef) {
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename || 'Planeacion_Didactica.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

function groupPlansByWeek(plans) {
  const groups = {};
  for (const p of (plans || [])) {
    const w = parseInt(p.numero_semana) || (p.fecha_aplicacion ? weekNumber(parseLocalDate(p.fecha_aplicacion)) : 1);
    if (!groups[w]) groups[w] = [];
    groups[w].push(p);
  }
  const weeks = Object.keys(groups).map(Number).sort((a, b) => b - a);
  return weeks.map(w => ({ semana: w, items: groups[w] }));
}

function renderPlaneaciones(plans) {
  const tbody = document.getElementById('plansList');
  const user = Storage.getUser();

  if (!tbody) return;

  if (!plans || plans.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 20px;">No se encontraron planeaciones registradas</td></tr>`;
    return;
  }

  const currentWeek = weekNumber(new Date());
  const grouped = groupPlansByWeek(plans);

  let html = '';
  grouped.forEach(({ semana, items }) => {
    const isCurrent = semana === currentWeek;
    html += `
      <tr style="background: var(--bg, rgba(56,189,248,0.06)); border-top: 2px solid var(--primary-accent, #0284c7); border-bottom: 1px solid var(--border, #334155);">
        <td colspan="8" style="padding: 10px 14px; font-weight: 700; color: var(--primary-accent, #0284c7); font-size: 13.5px;">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <span style="display: flex; align-items: center; gap: 8px;">
              🗓️ <strong>SEMANA ${semana}</strong>
              ${isCurrent ? '<span style="font-size:11px; background:#10b981; color:#fff; padding:2px 8px; border-radius:12px; font-weight:700;">SEMANA ACTUAL</span>' : ''}
            </span>
            <span style="font-size: 11.5px; background: rgba(56,189,248,0.15); color: var(--primary-accent, #0284c7); padding: 3px 10px; border-radius: 12px; font-weight: 600;">
              📁 ${items.length} ${items.length === 1 ? 'Planeación' : 'Planeaciones'}
            </span>
          </div>
        </td>
      </tr>
    `;

    items.forEach(p => {
      const dur = extractDuracion(p.observaciones);
      const esPropia = user && (user.rol === 'docente' || (user.docente_id && parseInt(user.docente_id) === parseInt(p.docente_id)));
      const pdfUrl = getPdfUrl(p);
      const cleanName = getCleanPdfFileName(p);

      html += `
      <tr style="border-bottom: 1px solid var(--border, #334155);">
        <td style="padding: 8px 10px;"><strong>${p.docente_nombre || 'Docente'}</strong></td>
        <td style="padding: 8px 10px;">${p.sede_nombre || '-'}<br><small style="color:var(--text-muted)">${p.jornada_nombre || '-'}</small></td>
        <td style="padding: 8px 10px;">
          ${p.area || '-'}<br><small style="color:var(--text-muted)">${p.grado || '-'}</small>
          ${dur ? `<br><span style="display:inline-block; margin-top:2px; font-size:10px; padding:1px 6px; background:rgba(56,189,248,0.15); color:var(--primary-accent); border-radius:4px; font-weight:600;">⏱️ ${dur} ${parseInt(dur) === 1 ? 'clase' : 'clases'}</span>` : ''}
        </td>
        <td style="padding: 8px 10px; white-space: nowrap;">${p.fecha_aplicacion ? new Date(p.fecha_aplicacion).toLocaleDateString('es-CO') : '-'}</td>
        <td style="padding: 8px 10px; white-space: nowrap; font-size: 11px;">${fmtDate(p.fecha_subida)}</td>
        <td style="padding: 8px 10px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${cleanName}">
          ${pdfUrl ? `
            <button onclick="downloadPdfFile(${p.id}, '${pdfUrl}', '${cleanName}')" class="btn btn-sm btn-light" style="padding:4px 8px; font-size:11px; color:#0284c7; font-weight:bold; cursor:pointer; display:inline-flex; align-items:center; gap:4px; border:1px solid var(--border);">
              📥 Descargar
            </button>
          ` : `<code>📄 ${cleanName}</code>`}
        </td>
        <td style="padding: 8px 10px; white-space: nowrap;">${badge(p.estado)}</td>
        <td style="text-align: center; white-space: nowrap; padding: 8px 10px;">
          ${pdfUrl ? `
            <button class="btn btn-primary" style="padding: 4px 8px; font-size: 11px; margin-right: 4px; background:#0284c7;" onclick="openPdfViewerModal(${p.id})">📄 Ver PDF</button>
            <button class="btn btn-success" style="padding: 4px 8px; font-size: 11px; margin-right: 4px; background:#10b981; color:#fff; cursor:pointer;" onclick="downloadPdfFile(${p.id}, '${pdfUrl}', '${cleanName}')">📥 Descargar</button>
          ` : ''}
          <button class="btn btn-light" style="padding: 4px 8px; font-size: 11px; margin-right: 4px;" onclick="viewPlanDetail(${p.id})">🔍 Detalle</button>
          ${esPropia ? `
            <button class="btn btn-primary" style="padding: 4px 8px; font-size: 11px; margin-right: 4px; background:#0ea5e9;" onclick="openReemplazarModal(${p.id})">📤 Reemplazar</button>
            <button class="btn btn-danger" style="padding: 4px 8px; font-size: 11px;" onclick="confirmarEliminarDocente(${p.id})">🗑️ Eliminar</button>
          ` : ''}
          ${user && user.rol === 'administrador' ? `
            <button class="btn btn-danger" style="padding: 4px 8px; font-size: 11px;" onclick="deletePlaneacion(${p.id})">Eliminar</button>
          ` : ''}
        </td>
      </tr>
      `;
    });
  });

  tbody.innerHTML = html;
}

function viewPlanDetail(id) {
  const plan = allPlaneaciones.find(p => p.id === id);
  if (!plan) return;

  const existing = document.getElementById('planDetailModal');
  if (existing) existing.remove();

  const pdfUrl = getPdfUrl(plan);
  const cleanName = getCleanPdfFileName(plan);

  const modal = document.createElement('div');
  modal.id = 'planDetailModal';
  modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.6); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px; animation: fadeIn 0.2s ease;';

  modal.innerHTML = `
    <div style="background:var(--surface); color:var(--text-main); border-radius:16px; padding:28px; max-width:550px; width:100%; box-shadow: 0 20px 50px rgba(0,0,0,0.3); border:1px solid var(--border);">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:14px; margin-bottom:18px;">
        <h3 style="margin:0; font-size:18px; color:var(--primary-navy);">📁 Detalle de la Planeación Didáctica</h3>
        <button onclick="document.getElementById('planDetailModal').remove()" style="background:none; border:none; font-size:20px; cursor:pointer; color:var(--text-muted);">&times;</button>
      </div>
      
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; font-size:13.5px;">
        <div><strong>Docente:</strong><br>${plan.docente_nombre || '-'}</div>
        <div><strong>Documento:</strong><br>${plan.docente_doc || '-'}</div>
        <div><strong>Sede:</strong><br>${plan.sede_nombre || '-'}</div>
        <div><strong>Jornada:</strong><br>${plan.jornada_nombre || '-'}</div>
        <div><strong>Área / Asignatura:</strong><br>${plan.area || '-'}</div>
        <div><strong>Grado Académico:</strong><br>${plan.grado || '-'}</div>
        <div><strong>Fecha Aplicación:</strong><br>${plan.fecha_aplicacion ? new Date(plan.fecha_aplicacion).toLocaleDateString('es-CO') : '-'}</div>
        <div><strong>Semana ISO:</strong><br>Semana ${plan.numero_semana || '-'}</div>
        <div><strong>Fecha Subida:</strong><br>${fmtDate(plan.fecha_subida)}</div>
        <div><strong>Estado:</strong><br>${badge(plan.estado)}</div>
        <div><strong>Duración Estimada:</strong><br>${extractDuracion(plan.observaciones) ? `${extractDuracion(plan.observaciones)} clase(s)` : '1 clase'}</div>
        <div><strong>Nombre del Archivo:</strong><br>${pdfUrl ? `<button type="button" class="btn btn-primary btn-sm" onclick="openPdfViewerModal(${plan.id})" style="padding:3px 10px; font-size:12px;">📄 Visor Modal PDF</button> <button type="button" class="btn btn-success btn-sm" onclick="downloadPdfFile(${plan.id}, '${pdfUrl}', '${cleanName}')" style="padding:3px 10px; font-size:12px; margin-left:8px;">📥 Descargar</button>` : `<code>${cleanName}</code>`}</div>
        <div style="grid-column: span 2; background:var(--bg); padding:12px; border-radius:8px; border:1px solid var(--border); margin-top:6px;">
          <strong>Observaciones / Notas Adicionales:</strong><br>
          <p style="margin:6px 0 0; color:var(--text-muted); font-size:13px; white-space:pre-wrap;">${cleanObs(plan.observaciones) || 'Sin observaciones registradas.'}</p>
        </div>
      </div>

      <div style="margin-top:22px; display:flex; justify-content:flex-end; gap:10px;">
        <button type="button" class="btn btn-light" onclick="document.getElementById('planDetailModal').remove()">Cerrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function savePlaneacion(e) {
  e.preventDefault();
  let user = Storage.getUser();
  let did = user && user.rol === 'docente' ? user.docente_id : parseInt(document.getElementById('docenteId')?.value);

  // Si el docente no tiene docente_id en la sesión activa, vincularlo automáticamente por su correo o nombre
  if (user && user.rol === 'docente' && (!did || isNaN(parseInt(did)))) {
    try {
      const allDocs = await API.Docentes.getAll();
      const userMail = (user.correo || '').toLowerCase().trim();
      const userName = (user.nombre || '').toLowerCase().trim();

      let myDoc = allDocs.find(d => d.correo && d.correo.toLowerCase().trim() === userMail);
      if (!myDoc && userName) {
        myDoc = allDocs.find(d => d.nombre && d.nombre.toLowerCase().trim() === userName);
      }

      if (myDoc) {
        did = myDoc.id;
        user.docente_id = myDoc.id;
        Storage.setSession(Storage.getToken(), user);
      }
    } catch (err) {
      console.error('Error al autorecuperar docente_id:', err);
    }
  }

  if (!did || isNaN(did)) {
    showToast('No se encontró la identidad del docente. Por favor seleccione un docente de la lista o vuelva a iniciar sesión.', 'error');
    return;
  }

  const areaVal = (document.getElementById('area').value || '').trim();
  if (!areaVal) {
    showToast('⚠️ Por favor seleccione el área o asignatura', 'error');
    return;
  }

  const gradoVal = (document.getElementById('grado').value || '').trim();
  if (!gradoVal) {
    showToast('⚠️ Por favor seleccione el grado académico', 'error');
    return;
  }

  const fechaAppStr = document.getElementById('fechaAplicacion').value;
  if (!fechaAppStr) {
    showToast('⚠️ Por favor seleccione la fecha de aplicación', 'error');
    return;
  }

  const fileInput = document.getElementById('archivo');
  const file = fileInput ? fileInput.files[0] : null;

  if (!file && !document.getElementById('nombreArchivo').value) {
    showToast('Debe adjuntar el archivo PDF de la planeación', 'error');
    return;
  }

  if (file) {
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    if (!isPdf) {
      showToast('Únicamente se aceptan archivos en formato PDF (.pdf)', 'error');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      showToast('El archivo PDF supera el tamaño máximo de 50 MB', 'error');
      return;
    }
  }

  const fileName = file ? file.name : document.getElementById('nombreArchivo').value;
  const duracion = (document.getElementById('duracionClases') || {}).value || '1';
  const userObs = (document.getElementById('observaciones').value || '').trim();
  const obsFinal = userObs ? `[Duración: ${duracion} clase(s)] ${userObs}` : `[Duración: ${duracion} clase(s)]`;
  const fechaApp = parseLocalDate(fechaAppStr);
  const autoSemana = parseInt(document.getElementById('selSemanaDocente')?.value) || weekNumber(fechaApp);
  const now = new Date();
  const currentSemana = weekNumber(now);
  const maxSemanaPermitida = currentSemana + 1;

  if (user && user.rol === 'docente' && autoSemana > maxSemanaPermitida) {
    showToast(`⚠️ Por motivos de seguridad de software, no se permite registrar planeaciones con más de 1 semana de antelación (Máximo Semana ${maxSemanaPermitida}).`, 'error');
    return;
  }

  const btn = document.getElementById('btnSubmitPlan');
  if (btn) { btn.disabled = true; btn.innerText = '⏳ Subiendo archivo PDF...'; }

  let fileUrl = '';
  if (file) {
    try {
      fileUrl = await uploadPdfDirectToStorage(file);
    } catch (upErr) {
      console.warn('Subida directa a Supabase Storage falló, enviando por servidor:', upErr);
    }
  }

  try {
    if (btn) { btn.innerText = '⏳ Guardando planeación...'; }

    if (fileUrl) {
      // Subida ultra rápida por JSON (evita el límite de 4.5 MB de Vercel)
      await API.Planeaciones.create({
        docente_id: did,
        area: document.getElementById('area').value.trim(),
        grado: document.getElementById('grado').value.trim(),
        fecha_aplicacion: fechaAppStr,
        numero_semana: autoSemana,
        observaciones: obsFinal,
        nombre_archivo: fileUrl
      });
    } else {
      // Fallback por FormData
      const payload = new FormData();
      payload.append('docente_id', did);
      payload.append('area', document.getElementById('area').value.trim());
      payload.append('grado', document.getElementById('grado').value.trim());
      payload.append('fecha_aplicacion', fechaAppStr);
      payload.append('numero_semana', autoSemana);
      payload.append('observaciones', obsFinal);
      if (file) {
        payload.append('archivo', file);
      } else {
        payload.append('nombre_archivo', fileName);
      }
      await API.Planeaciones.create(payload);
    }

    showToast('✅ Planeación registrada correctamente', 'success');
    
    try {
      document.getElementById('planForm').reset();
      clearSelectedFile();
      const today = new Date();
      document.getElementById('fechaAplicacion').value = today.toISOString().split('T')[0];
      updateAutoSemanaHelper();
    } catch (cleanErr) {}

    await loadPlaneaciones();
  } catch (err) {
    showToast(err.message || 'Error al registrar planeación', 'error');
  } finally {
    const btn = document.getElementById('btnSubmitPlan');
    if (btn) { btn.disabled = false; btn.innerText = '📤 Registrar y Subir Planeación'; }
  }
}

async function deletePlaneacion(id) {
  if (!confirm('¿Está seguro de eliminar esta planeación?')) return;
  try {
    const user = Storage.getUser();
    if (user && user.rol === 'docente') {
      confirmarEliminarDocente(id);
      return;
    }
    await API.Planeaciones.remove(id);
    showToast('Planeación eliminada correctamente', 'success');
    if (user && user.rol === 'administrador') {
      await loadAdminDocentes();
      const expModal = document.getElementById('docenteExpedienteModal');
      if (expModal) {
        const did = expModal.getAttribute('data-docente-id');
        if (did) openDocenteExpedienteModal(did);
      }
    } else {
      await loadPlaneaciones();
    }
  } catch (err) {
    showToast(err.message || 'Error al eliminar planeación', 'error');
  }
}

// ── Modal de Subida de Planeación para Administrador ──────────────────
async function openAdminUploadModal(preselectedDocenteId = null) {
  try {
    if (!docentesList || docentesList.length === 0) {
      docentesList = await API.Docentes.getAll();
    }
  } catch (e) {
    console.error('Error cargando docentes:', e);
  }

  const existing = document.getElementById('adminUploadModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'adminUploadModal';
  modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.85); backdrop-filter:blur(6px); z-index:999999; display:flex; align-items:center; justify-content:center; padding:16px; animation: fadeIn 0.2s ease;';

  const currentW = weekNumber(new Date());
  const mondayCurrentStr = getMondayOfISOWeek(currentW);

  const docOptionsHtml = (docentesList || []).map(d => {
    const isSel = preselectedDocenteId && String(d.id) === String(preselectedDocenteId);
    return `<option value="${d.id}" ${isSel ? 'selected' : ''}>${d.nombre} (${d.sede_nombre || 'I.E. Guaimaral'})</option>`;
  }).join('');

  let weekOptionsHtml = '';
  for (let w = currentW + 2; w >= MIN_SEMANA_LECTIVA; w--) {
    const isCur = w === currentW;
    weekOptionsHtml += `<option value="${w}" ${isCur ? 'selected' : ''}>Semana ${w}${isCur ? ' (Actual)' : ''}</option>`;
  }

  modal.innerHTML = `
    <div style="background:var(--surface, #1e293b); color:var(--text-main, #f1f5f9); border-radius:16px; max-width:650px; width:96%; max-height:92vh; display:flex; flex-direction:column; box-shadow:0 25px 60px rgba(0,0,0,0.6); border:1px solid var(--border, #334155); overflow:hidden;">
      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg, #0f172a); padding:16px 22px; border-bottom:1px solid var(--border, #334155);">
        <h3 style="margin:0; font-size:17px; font-weight:700; color:var(--primary-accent, #38bdf8); display:flex; align-items:center; gap:8px;">
          📤 Subir Planeación Didáctica (Administrador)
        </h3>
        <button type="button" onclick="document.getElementById('adminUploadModal').remove()" style="background:none; border:none; font-size:24px; cursor:pointer; color:var(--text-muted, #94a3b8);">&times;</button>
      </div>

      <form id="adminUploadForm" onsubmit="saveAdminModalPlaneacion(event)" style="padding:22px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:14px;">
        <div>
          <label style="display:block; font-size:12.5px; font-weight:700; margin-bottom:4px; color:var(--text-main);">Docente asignado *</label>
          <select id="adminModalDocenteId" required style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid var(--border, #334155); background:var(--bg, #0f172a); color:var(--text-main); font-size:13px;">
            <option value="">-- Seleccione un docente --</option>
            ${docOptionsHtml}
          </select>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div>
            <label style="display:block; font-size:12.5px; font-weight:700; margin-bottom:4px; color:var(--text-main);">Área / Asignatura *</label>
            <select id="adminModalArea" required style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid var(--border, #334155); background:var(--bg, #0f172a); color:var(--text-main); font-size:13px;">
              <option value="">Seleccione área...</option>
              <option value="Matemáticas">Matemáticas</option>
              <option value="Humanidades y Lengua Castellana">Humanidades y Lengua Castellana</option>
              <option value="Idioma Extranjero (Inglés)">Idioma Extranjero (Inglés)</option>
              <option value="Ciencias Naturales y Ed. Ambiental">Ciencias Naturales y Ed. Ambiental</option>
              <option value="Física">Física</option>
              <option value="Química">Química</option>
              <option value="Biología">Biología</option>
              <option value="Ciencias Sociales, Historia y Geografía">Ciencias Sociales, Historia y Geografía</option>
              <option value="Constitución Política y Cátedra de la Paz">Constitución Política y Cátedra de la Paz</option>
              <option value="Educación Artística y Cultural">Educación Artística y Cultural</option>
              <option value="Educación Física, Recreación y Deportes">Educación Física, Recreación y Deportes</option>
              <option value="Educación Ética y en Valores Humanos">Educación Ética y en Valores Humanos</option>
              <option value="Educación Religiosa">Educación Religiosa</option>
              <option value="Tecnología e Informática">Tecnología e Informática</option>
              <option value="Filosofía">Filosofía</option>
              <option value="Ciencias Económicas y Políticas">Ciencias Económicas y Políticas</option>
              <option value="Lectura Crítica">Lectura Crítica</option>
            </select>
          </div>
          <div>
            <label style="display:block; font-size:12.5px; font-weight:700; margin-bottom:4px; color:var(--text-main);">Grado Académico *</label>
            <select id="adminModalGrado" required style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid var(--border, #334155); background:var(--bg, #0f172a); color:var(--text-main); font-size:13px;">
              <option value="">Seleccione grado...</option>
              <option value="Prejardín">Prejardín</option>
              <option value="Jardín">Jardín</option>
              <option value="Transición">Transición</option>
              <option value="1°">1° Primaria</option>
              <option value="2°">2° Primaria</option>
              <option value="3°">3° Primaria</option>
              <option value="4°">4° Primaria</option>
              <option value="5°">5° Primaria</option>
              <option value="6°">6° Secundaria</option>
              <option value="7°">7° Secundaria</option>
              <option value="8°">8° Secundaria</option>
              <option value="9°">9° Secundaria</option>
              <option value="10°">10° Media Technical</option>
              <option value="11°">11° Media Technical</option>
            </select>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div>
            <label style="display:block; font-size:12.5px; font-weight:700; margin-bottom:4px; color:var(--text-main);">Semana Lectiva *</label>
            <select id="adminModalSemana" onchange="onAdminModalSemanaChange(this.value)" style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid var(--border, #334155); background:var(--bg, #0f172a); color:var(--text-main); font-size:13px;">
              ${weekOptionsHtml}
            </select>
          </div>
          <div>
            <label style="display:block; font-size:12.5px; font-weight:700; margin-bottom:4px; color:var(--text-main);">Fecha de Aplicación *</label>
            <input type="date" id="adminModalFechaApp" required value="${mondayCurrentStr}" style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid var(--border, #334155); background:var(--bg, #0f172a); color:var(--text-main); font-size:13px;">
          </div>
        </div>

        <div>
          <label style="display:block; font-size:12.5px; font-weight:700; margin-bottom:4px; color:var(--text-main);">Duración (Clases) *</label>
          <select id="adminModalDuracion" style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid var(--border, #334155); background:var(--bg, #0f172a); color:var(--text-main); font-size:13px;">
            <option value="1">1 Clase</option>
            <option value="2">2 Clases</option>
            <option value="3">3 Clases</option>
            <option value="4">4 Clases</option>
            <option value="5" selected>5 Clases (Semana Completa)</option>
          </select>
        </div>

        <div>
          <label style="display:block; font-size:12.5px; font-weight:700; margin-bottom:4px; color:var(--text-main);">Archivo PDF (Máx. 50 MB) *</label>
          <input type="file" id="adminModalArchivo" accept=".pdf,application/pdf" required style="width:100%; padding:8px; border-radius:8px; border:1px dashed var(--primary-accent, #38bdf8); background:rgba(56,189,248,0.05); color:var(--text-main); font-size:12.5px; cursor:pointer;">
        </div>

        <div>
          <label style="display:block; font-size:12.5px; font-weight:700; margin-bottom:4px; color:var(--text-main);">Observaciones (Opcional)</label>
          <textarea id="adminModalObs" placeholder="Observaciones institucionales o notas adicionales..." style="width:100%; padding:8px 12px; border-radius:8px; border:1px solid var(--border, #334155); background:var(--bg, #0f172a); color:var(--text-main); font-size:12.5px; height:60px;"></textarea>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:10px;">
          <button type="button" class="btn btn-light" onclick="document.getElementById('adminUploadModal').remove()">Cancelar</button>
          <button type="submit" id="btnAdminModalSubmit" class="btn btn-success" style="background:#10b981; border:none; padding:10px 20px; font-weight:700; font-size:13px; color:#fff; border-radius:8px; cursor:pointer;">
            🚀 Registrar Planeación
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);
}

function onAdminModalSemanaChange(val) {
  const w = parseInt(val);
  if (!w) return;
  const mondayStr = getMondayOfISOWeek(w);
  const dateInput = document.getElementById('adminModalFechaApp');
  if (dateInput) dateInput.value = mondayStr;
}

async function saveAdminModalPlaneacion(e) {
  e.preventDefault();
  const docenteId = document.getElementById('adminModalDocenteId').value;
  if (!docenteId) {
    showToast('⚠️ Por favor seleccione el docente asignado', 'error');
    return;
  }

  const area = document.getElementById('adminModalArea').value;
  if (!area) {
    showToast('⚠️ Por favor seleccione el área o asignatura', 'error');
    return;
  }

  const grado = document.getElementById('adminModalGrado').value;
  if (!grado) {
    showToast('⚠️ Por favor seleccione el grado académico', 'error');
    return;
  }

  const fechaAppStr = document.getElementById('adminModalFechaApp').value;
  if (!fechaAppStr) {
    showToast('⚠️ Por favor seleccione la fecha de aplicación', 'error');
    return;
  }

  const fileInput = document.getElementById('adminModalArchivo');
  const file = fileInput ? fileInput.files[0] : null;

  if (!file) {
    showToast('⚠️ Debe seleccionar el archivo PDF de la planeación', 'error');
    return;
  }

  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  if (!isPdf) {
    showToast('⚠️ Únicamente se aceptan archivos en formato PDF (.pdf)', 'error');
    return;
  }

  if (file.size > 50 * 1024 * 1024) {
    showToast('⚠️ El archivo PDF supera el tamaño máximo permitido de 50 MB', 'error');
    return;
  }

  const duracion = document.getElementById('adminModalDuracion').value || '5';
  const userObs = (document.getElementById('adminModalObs').value || '').trim();
  const obsFinal = userObs ? `[Duración: ${duracion} clase(s)] ${userObs}` : `[Duración: ${duracion} clase(s)]`;
  const autoSemana = parseInt(document.getElementById('adminModalSemana').value) || weekNumber(parseLocalDate(fechaAppStr));

  const btn = document.getElementById('btnAdminModalSubmit');
  if (btn) { btn.disabled = true; btn.innerText = '⏳ Subiendo archivo PDF...'; }

  let fileUrl = '';
  if (file) {
    try {
      fileUrl = await uploadPdfDirectToStorage(file);
    } catch (upErr) {
      console.warn('Subida directa falló, intentando por servidor:', upErr);
    }
  }

  try {
    if (btn) { btn.innerText = '⏳ Guardando planeación...'; }

    if (fileUrl) {
      await API.Planeaciones.create({
        docente_id: docenteId,
        area: area,
        grado: grado,
        fecha_aplicacion: fechaAppStr,
        numero_semana: autoSemana,
        observaciones: obsFinal,
        nombre_archivo: fileUrl
      });
    } else {
      const payload = new FormData();
      payload.append('docente_id', docenteId);
      payload.append('area', area);
      payload.append('grado', grado);
      payload.append('fecha_aplicacion', fechaAppStr);
      payload.append('numero_semana', autoSemana);
      payload.append('observaciones', obsFinal);
      if (file) payload.append('archivo', file);
      await API.Planeaciones.create(payload);
    }

    showToast('✅ Planeación registrada exitosamente como Administrador', 'success');

    const adminModal = document.getElementById('adminUploadModal');
    if (adminModal) adminModal.remove();

    await loadAdminDocentes();

    const expModal = document.getElementById('docenteExpedienteModal');
    if (expModal) {
      openDocenteExpedienteModal(docenteId);
    }
  } catch (err) {
    showToast(err.message || 'Error al registrar la planeación', 'error');
  } finally {
    const btn = document.getElementById('btnAdminModalSubmit');
    if (btn) { btn.disabled = false; btn.innerText = '🚀 Registrar Planeación'; }
  }
}

// ── Modal: Reemplazar PDF del docente ──
function openReemplazarModal(planId) {
  const existing = document.getElementById('reemplazarModal');
  if (existing) existing.remove();

  const user = Storage.getUser();
  const isAdmin = user && user.rol === 'administrador';

  const modal = document.createElement('div');
  modal.id = 'reemplazarModal';
  modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.65); backdrop-filter:blur(4px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px;';
  modal.innerHTML = `
    <div style="background:var(--surface, #1e293b); color:var(--text-main, #f1f5f9); border-radius:16px; padding:28px; max-width:460px; width:100%; box-shadow:0 20px 50px rgba(0,0,0,0.4); border:1px solid var(--border, #334155);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <h3 style="margin:0; font-size:17px; font-weight:700; color:var(--primary-accent, #38bdf8);">📤 Reemplazar Planeación PDF</h3>
        <button onclick="document.getElementById('reemplazarModal').remove()" style="background:none; border:none; font-size:20px; cursor:pointer; color:var(--text-muted, #94a3b8);">✕</button>
      </div>
      <p style="font-size:13px; color:var(--text-muted, #94a3b8); margin-bottom:18px;">
        ${isAdmin ? 'Selecciona el nuevo archivo PDF para reemplazar la planeación existente.' : 'Selecciona el nuevo archivo PDF y confirma tu contraseña para reemplazar la planeación.'}
      </p>

      <div style="margin-bottom:14px;">
        <label style="display:block; font-size:13px; font-weight:600; margin-bottom:6px;">Nuevo archivo PDF *</label>
        <input type="file" id="reemplazarArchivo" accept=".pdf,application/pdf" style="width:100%; padding:8px; border:1px solid var(--border, #334155); border-radius:8px; background:var(--bg, #0f172a); color:inherit; font-size:13px;">
      </div>

      <div style="margin-bottom:20px; ${isAdmin ? 'display:none;' : ''}">
        <label style="display:block; font-size:13px; font-weight:600; margin-bottom:6px;">Contraseña *</label>
        <div style="position:relative; display:flex; align-items:center;">
          <input type="password" id="reemplazarPass" placeholder="Confirma tu contraseña" style="width:100%; padding:10px 40px 10px 14px; border:1px solid var(--border, #334155); border-radius:8px; background:var(--bg, #0f172a); color:inherit; font-size:13px;">
          <button type="button" onclick="toggleModalPassVisibility('reemplazarPass', this)" style="position:absolute; right:10px; background:none; border:none; cursor:pointer; font-size:16px; opacity:0.7;">👁️</button>
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px;">
        <button class="btn btn-light" onclick="document.getElementById('reemplazarModal').remove()">Cancelar</button>
        <button class="btn btn-primary" id="btnConfirmarReemplazar" onclick="ejecutarReemplazar(${planId})" style="background:#0ea5e9;">📤 Confirmar Reemplazo</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function ejecutarReemplazar(planId) {
  const user = Storage.getUser();
  const isAdmin = user && user.rol === 'administrador';
  const fileInput = document.getElementById('reemplazarArchivo');
  const pass = (document.getElementById('reemplazarPass')?.value || '').trim();
  const file = fileInput && fileInput.files[0];

  if (!file) { showToast('⚠️ Debes seleccionar un archivo PDF', 'error'); return; }
  if (!isAdmin && !pass) { showToast('⚠️ Debes ingresar tu contraseña', 'error'); return; }

  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  if (!isPdf) { showToast('Solo se aceptan archivos PDF', 'error'); return; }

  const btn = document.getElementById('btnConfirmarReemplazar');
  if (btn) { btn.disabled = true; btn.innerText = '⏳ Subiendo archivo PDF...'; }

  let fileUrl = '';
  if (file) {
    try {
      fileUrl = await uploadPdfDirectToStorage(file);
    } catch (upErr) {
      console.warn('Subida directa de reemplazo falló, intentando por servidor:', upErr);
    }
  }

  try {
    const token = Storage.getToken();
    const endpointUrl = (typeof API_BASE !== 'undefined' ? API_BASE : '/api');

    let res;
    if (fileUrl) {
      res = await fetch(`${endpointUrl}/planeaciones/${planId}/reemplazar`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nombre_archivo: fileUrl,
          password_confirmacion: pass || undefined
        })
      });
    } else {
      const formData = new FormData();
      formData.append('archivo', file);
      if (pass) formData.append('password_confirmacion', pass);

      res = await fetch(`${endpointUrl}/planeaciones/${planId}/reemplazar`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al reemplazar');

    document.getElementById('reemplazarModal')?.remove();
    showToast('✅ PDF reemplazado correctamente', 'success');

    if (isAdmin) {
      await loadAdminDocentes();
      const expModal = document.getElementById('docenteExpedienteModal');
      if (expModal) {
        const did = expModal.getAttribute('data-docente-id');
        if (did) openDocenteExpedienteModal(did);
      }
    } else {
      await loadPlaneaciones();
    }
  } catch (err) {
    showToast(err.message || 'Error al reemplazar PDF', 'error');
  } finally {
    const btn = document.getElementById('btnConfirmarReemplazar');
    if (btn) { btn.disabled = false; btn.innerText = '📤 Confirmar Reemplazo'; }
  }
}

// ── Modal: Eliminar planeación del docente con contraseña ──
function confirmarEliminarDocente(planId) {
  const existing = document.getElementById('eliminarModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'eliminarModal';
  modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.65); backdrop-filter:blur(4px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px;';
  modal.innerHTML = `
    <div style="background:var(--surface, #1e293b); color:var(--text-main, #f1f5f9); border-radius:16px; padding:28px; max-width:420px; width:100%; box-shadow:0 20px 50px rgba(0,0,0,0.4); border:1px solid var(--border, #334155);">
      <h3 style="margin:0 0 12px; font-size:17px; color:#f87171;">🗑️ Eliminar Planeación</h3>
      <p style="font-size:13px; color:var(--text-muted, #94a3b8); margin-bottom:18px;">Esta acción es irreversible. Ingresa tu contraseña para confirmar.</p>
      <div style="margin-bottom:20px;">
        <label style="display:block; font-size:13px; font-weight:600; margin-bottom:6px;">Contraseña *</label>
        <div style="position:relative; display:flex; align-items:center;">
          <input type="password" id="eliminarPass" placeholder="Confirma tu contraseña" style="width:100%; padding:10px 40px 10px 14px; border:1px solid var(--border, #334155); border-radius:8px; background:var(--bg, #0f172a); color:inherit; font-size:13px;">
          <button type="button" onclick="toggleModalPassVisibility('eliminarPass', this)" style="position:absolute; right:10px; background:none; border:none; cursor:pointer; font-size:16px; opacity:0.7;">👁️</button>
        </div>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:10px;">
        <button class="btn btn-light" onclick="document.getElementById('eliminarModal').remove()">Cancelar</button>
        <button class="btn btn-danger" id="btnConfirmarEliminar" onclick="ejecutarEliminar(${planId})">Confirmar Eliminación</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function ejecutarEliminar(planId) {
  const pass = (document.getElementById('eliminarPass').value || '').trim();
  if (!pass) { showToast('⚠️ Debes ingresar tu contraseña', 'error'); return; }

  const btn = document.getElementById('btnConfirmarEliminar');
  if (btn) { btn.disabled = true; btn.innerText = 'Eliminando...'; }

  try {
    await API.Planeaciones.remove(planId, pass);
    document.getElementById('eliminarModal').remove();
    showToast('✅ Planeación eliminada correctamente', 'success');
    await loadPlaneaciones();
  } catch (err) {
    if (btn) { btn.disabled = false; btn.innerText = 'Confirmar Eliminación'; }
    showToast(err.message || 'Error al eliminar', 'error');
  }
}

// ── Modal Visor PDF Interactivo Integrado Pro ──────────────────
function openPdfViewerModal(planId) {
  const plan = allPlaneaciones.find(p => p.id === planId);
  if (!plan) return;

  const pdfUrl = getPdfUrl(plan);
  if (!pdfUrl) {
    showToast('El documento no tiene una URL de PDF disponible.', 'error');
    return;
  }

  const cleanName = getCleanPdfFileName(plan);

  const existing = document.getElementById('pdfViewerModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'pdfViewerModal';
  modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.85); backdrop-filter:blur(8px); z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:16px; animation: fadeIn 0.2s ease;';

  modal.innerHTML = `
    <div style="background:var(--surface, #1e293b); color:var(--text-main, #f1f5f9); border-radius:16px; max-width:1150px; width:98%; height:92vh; display:flex; flex-direction:column; box-shadow: 0 25px 60px rgba(0,0,0,0.6); border:1px solid var(--border, #334155); overflow:hidden;">
      
      <!-- Topbar Header -->
      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg, #0f172a); padding:12px 20px; border-bottom:1px solid var(--border, #334155); flex-wrap:wrap; gap:10px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="font-size:24px;">📄</span>
          <div>
            <h3 style="margin:0; font-size:16px; font-weight:700; color:var(--primary-accent, #38bdf8); display:flex; align-items:center; gap:8px;">
              ${plan.area || 'Planeación Didáctica'}
              <span style="font-size:11px; padding:2px 8px; background:rgba(56,189,248,0.15); border-radius:12px; color:#38bdf8; font-weight:600;">Semana ${plan.numero_semana || '-'}</span>
            </h3>
            <small style="color:var(--text-muted, #94a3b8); font-size:12px;">
              Docente: <strong>${plan.docente_nombre || 'Docente'}</strong> · Grado: ${plan.grado || '-'} · Aplicación: ${plan.fecha_aplicacion ? new Date(plan.fecha_aplicacion).toLocaleDateString('es-CO') : '-'}
            </small>
          </div>
        </div>

        <!-- Acciones Pro -->
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <button type="button" onclick="downloadPdfFile(${plan.id}, '${pdfUrl}', '${cleanName}')" class="btn btn-success btn-sm" style="padding:6px 14px; font-size:12px; display:inline-flex; align-items:center; gap:6px; background:#10b981; color:#fff; border:none; border-radius:6px; font-weight:600; cursor:pointer;">
            📥 Descargar PDF
          </button>
          <a href="${pdfUrl}" target="_blank" class="btn btn-light btn-sm" style="padding:6px 12px; font-size:12px; display:inline-flex; align-items:center; gap:6px; text-decoration:none; color:var(--text-main, #f1f5f9); background:rgba(255,255,255,0.1); border:1px solid var(--border, #334155); border-radius:6px; font-weight:600;">
            🔗 Abrir Pestaña
          </a>
          <button type="button" onclick="toggleModalFullscreen('pdfViewerModal')" class="btn btn-light btn-sm" style="padding:6px 10px; font-size:12px; background:rgba(255,255,255,0.1); border:1px solid var(--border, #334155); border-radius:6px; color:var(--text-main, #f1f5f9); cursor:pointer;" title="Pantalla Completa">
            ⤢ Fullscreen
          </button>
          <button type="button" onclick="document.getElementById('pdfViewerModal').remove()" style="background:none; border:none; font-size:24px; cursor:pointer; color:var(--text-muted, #94a3b8); line-height:1; padding:0 6px; margin-left:4px;" title="Cerrar (Esc)">&times;</button>
        </div>
      </div>

      <!-- Iframe Container -->
      <div style="flex:1; width:100%; height:100%; background:#525659; position:relative;">
        <iframe src="${pdfUrl}#toolbar=1&navpanes=0" style="width:100%; height:100%; border:none;" title="Visor de Planeación PDF"></iframe>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      const m = document.getElementById('pdfViewerModal');
      if (m) m.remove();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

function toggleModalFullscreen(modalId) {
  const m = document.getElementById(modalId);
  if (!m) return;
  if (!document.fullscreenElement) {
    m.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

