let docentesList = [];

async function initPlaneacionesPage() {
  startLiveClock();
  const today = new Date();
  if (document.getElementById('fechaAplicacion')) {
    document.getElementById('fechaAplicacion').value = today.toISOString().split('T')[0];
    updateAutoSemanaHelper();
  }

  const user = Storage.getUser();
  const formCard = document.getElementById('formCard');
  const listCard = document.getElementById('listCard');
  const docenteGroup = document.getElementById('docenteGroup');

  // El formulario de registro está disponible para TODOS
  if (formCard) formCard.style.display = 'block';
  if (listCard) {
    listCard.classList.remove('c12');
    listCard.classList.add('c8');
  }

  if (user && user.rol === 'administrador') {
    // Pedro el Administrador solo consulta la lista completa de planeaciones
    if (formCard) formCard.style.display = 'none';
    if (listCard) {
      listCard.classList.remove('c8');
      listCard.classList.add('c12');
    }
  } else {
    // Los docentes ven el formulario para subir sus planeaciones
    if (formCard) formCard.style.display = 'block';
    if (listCard) {
      listCard.classList.remove('c12');
      listCard.classList.add('c8');
    }
    const docenteGroup = document.getElementById('docenteGroup');
    if (docenteGroup) docenteGroup.style.display = 'none';
  }

  await loadPlaneaciones();
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
  const dateObj = new Date(val);
  const w = weekNumber(dateObj);
  if (helper) {
    helper.innerHTML = `<div style="margin-top:6px; font-size:12px; font-weight:600; color:var(--primary-accent); display:flex; align-items:center; gap:6px;">
      <span>🗓️ Semana ISO Calculada Automáticamente: <strong>Semana ${w}</strong></span>
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

function handleFileChange(e) {
  const file = e.target.files[0];
  if (!file) return;

  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  if (!isPdf) {
    showToast('⚠️ Formato no permitido. Únicamente se aceptan archivos PDF (.pdf)', 'error');
    e.target.value = '';
    document.getElementById('nombreArchivo').value = '';
    return;
  }

  const MAX_MB = 50;
  const maxBytes = MAX_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    showToast(`⚠️ El archivo pesa ${sizeMB} MB. El límite máximo de peso es de ${MAX_MB} MB.`, 'error');
    e.target.value = '';
    document.getElementById('nombreArchivo').value = '';
    return;
  }

  document.getElementById('nombreArchivo').value = file.name;
  showToast(`✅ Archivo PDF válido (${(file.size / (1024 * 1024)).toFixed(1)} MB)`, 'success');
}

let allPlaneaciones = [];

async function loadPlaneaciones() {
  try {
    allPlaneaciones = await API.Planeaciones.getAll();
    renderPlaneaciones(allPlaneaciones);
  } catch (err) {
    showToast('Error al obtener planeaciones', 'error');
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

function renderPlaneaciones(plans) {
  const tbody = document.getElementById('plansList');
  const user = Storage.getUser();

  if (!plans || plans.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 20px;">No se encontraron planeaciones registradas</td></tr>`;
    return;
  }

  tbody.innerHTML = plans.map(p => {
    const dur = extractDuracion(p.observaciones);
    return `
    <tr>
      <td style="padding: 8px 10px;"><strong>${p.docente_nombre || 'Docente'}</strong></td>
      <td style="padding: 8px 10px;">${p.sede_nombre || '-'}<br><small style="color:var(--text-muted)">${p.jornada_nombre || '-'}</small></td>
      <td style="padding: 8px 10px;">
        ${p.area || '-'}<br><small style="color:var(--text-muted)">${p.grado || '-'}</small>
        ${dur ? `<br><span style="display:inline-block; margin-top:2px; font-size:10px; padding:1px 6px; background:rgba(56,189,248,0.15); color:var(--primary-accent); border-radius:4px; font-weight:600;">⏱️ ${dur} ${parseInt(dur) === 1 ? 'clase' : 'clases'}</span>` : ''}
      </td>
      <td style="padding: 8px 10px; white-space: nowrap;">${p.fecha_aplicacion ? new Date(p.fecha_aplicacion).toLocaleDateString('es-CO') : '-'}</td>
      <td style="padding: 8px 10px; white-space: nowrap; font-size: 11px;">${fmtDate(p.fecha_subida)}</td>
      <td style="padding: 8px 10px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${p.nombre_archivo || ''}">
        ${p.nombre_archivo && p.nombre_archivo.startsWith('http') ? `<a href="${p.nombre_archivo}" target="_blank" style="color:var(--primary-accent); font-weight:bold; text-decoration:none;">📥 Ver PDF</a>` : `<code>📄 ${p.nombre_archivo || 'Documento'}</code>`}
      </td>
      <td style="padding: 8px 10px; white-space: nowrap;">${badge(p.estado)}</td>
      <td style="text-align: center; white-space: nowrap; padding: 8px 10px;">
        <button class="btn btn-light" style="padding: 4px 8px; font-size: 11px; margin-right: 4px;" onclick="viewPlanDetail(${p.id})">🔍 Detalle</button>
        ${user && user.rol === 'administrador' ? `
          <button class="btn btn-danger" style="padding: 4px 8px; font-size: 11px;" onclick="deletePlaneacion(${p.id})">Eliminar</button>
        ` : ''}
      </td>
    </tr>
  `}).join('');
}

function viewPlanDetail(id) {
  const plan = allPlaneaciones.find(p => p.id === id);
  if (!plan) return;

  const existing = document.getElementById('planDetailModal');
  if (existing) existing.remove();

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
        <div><strong>Nombre del Archivo:</strong><br>${plan.nombre_archivo && plan.nombre_archivo.startsWith('http') ? `<a href="${plan.nombre_archivo}" target="_blank" style="color:var(--primary-accent); font-weight:bold;">📥 Descargar PDF</a>` : `<code>${plan.nombre_archivo || '-'}</code>`}</div>
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
  let did = user && user.rol === 'docente' ? user.docente_id : parseInt(document.getElementById('docenteId').value);

  // Si el docente no tiene docente_id en la sesión activa, vincularlo automáticamente por su correo
  if (user && user.rol === 'docente' && !did) {
    try {
      const allDocs = await API.Docentes.getAll();
      const myDoc = allDocs.find(d => d.correo && d.correo.toLowerCase() === (user.correo || '').toLowerCase());
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
  const fechaApp = new Date(fechaAppStr);
  const autoSemana = weekNumber(fechaApp);

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

  try {
    const btn = document.getElementById('btnSubmitPlan');
    if (btn) { btn.disabled = true; btn.innerText = 'Guardando...'; }

    await API.Planeaciones.create(payload);
    showToast('✅ Planeación registrada correctamente', 'success');
    
    document.getElementById('planForm').reset();
    document.getElementById('nombreArchivo').value = '';
    const today = new Date();
    document.getElementById('fechaAplicacion').value = today.toISOString().split('T')[0];
    updateAutoSemanaHelper();

    if (btn) { btn.disabled = false; btn.innerText = '📤 Registrar y Subir Planeación'; }
    await loadPlaneaciones();
  } catch (err) {
    const btn = document.getElementById('btnSubmitPlan');
    if (btn) { btn.disabled = false; btn.innerText = '📤 Registrar y Subir Planeación'; }
    showToast(err.message || 'Error al registrar planeación', 'error');
  }
}

async function deletePlaneacion(id) {
  if (!confirm('¿Está seguro de eliminar esta planeación?')) return;
  try {
    await API.Planeaciones.remove(id);
    showToast('Planeación eliminada', 'success');
    await loadPlaneaciones();
  } catch (err) {
    showToast(err.message || 'Error al eliminar planeación', 'error');
  }
}
