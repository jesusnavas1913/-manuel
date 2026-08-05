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

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  const dz = document.getElementById('dropZone');
  if (dz) dz.style.background = 'rgba(56,189,248,0.15)';
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  const dz = document.getElementById('dropZone');
  if (dz) dz.style.background = 'rgba(56,189,248,0.04)';
}

function handleFileDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  const dz = document.getElementById('dropZone');
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
  const content = document.getElementById('dropZoneContent');
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

function renderPlaneaciones(plans) {
  const tbody = document.getElementById('plansList');
  const user = Storage.getUser();

  if (!plans || plans.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 20px;">No se encontraron planeaciones registradas</td></tr>`;
    return;
  }

  tbody.innerHTML = plans.map(p => {
    const dur = extractDuracion(p.observaciones);
    const esPropia = user && user.rol === 'docente' && user.docente_id && parseInt(user.docente_id) === parseInt(p.docente_id);
    const pdfUrl = getPdfUrl(p);
    const cleanName = getCleanPdfFileName(p);

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
  `}).join('');
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
    clearSelectedFile();
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

// ── Modal: Reemplazar PDF del docente (con confirmación de contraseña) ──
function openReemplazarModal(planId) {
  const existing = document.getElementById('reemplazarModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'reemplazarModal';
  modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.65); backdrop-filter:blur(4px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px;';
  modal.innerHTML = `
    <div style="background:var(--surface, #1e293b); color:var(--text-main, #f1f5f9); border-radius:16px; padding:28px; max-width:460px; width:100%; box-shadow:0 20px 50px rgba(0,0,0,0.4); border:1px solid var(--border, #334155);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <h3 style="margin:0; font-size:17px; font-weight:700; color:var(--primary-accent, #38bdf8);">📤 Reemplazar Planeación PDF</h3>
        <button onclick="document.getElementById('reemplazarModal').remove()" style="background:none; border:none; font-size:20px; cursor:pointer; color:var(--text-muted, #94a3b8);">✕</button>
      </div>
      <p style="font-size:13px; color:var(--text-muted, #94a3b8); margin-bottom:18px;">Selecciona el nuevo archivo PDF y confirma tu contraseña para reemplazar la planeación.</p>

      <div style="margin-bottom:14px;">
        <label style="display:block; font-size:13px; font-weight:600; margin-bottom:6px;">Nuevo archivo PDF *</label>
        <input type="file" id="reemplazarArchivo" accept=".pdf,application/pdf" style="width:100%; padding:8px; border:1px solid var(--border, #334155); border-radius:8px; background:var(--bg, #0f172a); color:inherit; font-size:13px;">
      </div>

      <div style="margin-bottom:20px;">
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
  const fileInput = document.getElementById('reemplazarArchivo');
  const pass = (document.getElementById('reemplazarPass').value || '').trim();
  const file = fileInput && fileInput.files[0];

  if (!file) { showToast('⚠️ Debes seleccionar un archivo PDF', 'error'); return; }
  if (!pass) { showToast('⚠️ Debes ingresar tu contraseña', 'error'); return; }

  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  if (!isPdf) { showToast('Solo se aceptan archivos PDF', 'error'); return; }

  const btn = document.getElementById('btnConfirmarReemplazar');
  if (btn) { btn.disabled = true; btn.innerText = 'Subiendo...'; }

  try {
    // 1. Subir nuevo PDF reutilizando el endpoint de crear planeación
    //    Pero necesitamos actualizar la planeación existente con el nuevo archivo
    //    Primero subimos el archivo al storage y obtenemos la URL
    const formData = new FormData();
    formData.append('archivo', file);
    formData.append('password_confirmacion', pass);

    // Llamar al endpoint de actualización con el archivo
    const token = Storage.getToken();
    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168')
      ? `http://${window.location.hostname}:3001/api`
      : '/api';

    const res = await fetch(`${API_BASE}/planeaciones/${planId}/reemplazar`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al reemplazar');

    document.getElementById('reemplazarModal').remove();
    showToast('✅ PDF reemplazado correctamente', 'success');
    await loadPlaneaciones();
  } catch (err) {
    if (btn) { btn.disabled = false; btn.innerText = '📤 Confirmar Reemplazo'; }
    showToast(err.message || 'Error al reemplazar PDF', 'error');
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

