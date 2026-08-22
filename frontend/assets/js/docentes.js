let docentesData = [];
let sedesData = [];

const COLOMBIAN_AREAS = [
  'Matemáticas',
  'Humanidades y Lengua Castellana',
  'Idioma Extranjero (Inglés)',
  'Ciencias Naturales y Ed. Ambiental',
  'Física',
  'Química',
  'Biología',
  'Ciencias Sociales, Historia y Geografía',
  'Constitución Política y Cátedra de la Paz',
  'Educación Artística y Cultural',
  'Educación Física, Recreación y Deportes',
  'Educación Ética y en Valores Humanos',
  'Educación Religiosa',
  'Tecnología e Informática',
  'Filosofía',
  'Ciencias Económicas y Políticas',
  'Cátedra de Estudios Afrocolombianos',
  'Lectura Crítica'
];

const COLOMBIAN_GRADES = [
  'Prejardín', 'Jardín', 'Transición',
  '1°', '2°', '3°', '4°', '5°',
  '6°', '7°', '8°', '9°',
  '10°', '11°'
];

async function initDocentesPage() {
  renderChips();
  await loadOptions();
  await loadDocentes();
}

function renderChips() {
  // Áreas
  const areasGroup = document.getElementById('areasGroup');
  areasGroup.innerHTML = COLOMBIAN_AREAS.map((a, i) => `
    <label class="chip-option" id="lblArea_${i}">
      <input type="checkbox" name="areaCheck" value="${a}" onchange="toggleChip(this)">
      ${a}
    </label>
  `).join('');

  // Grados
  const gradosGroup = document.getElementById('gradosGroup');
  gradosGroup.innerHTML = COLOMBIAN_GRADES.map((g, i) => `
    <label class="chip-option" id="lblGrad_${i}">
      <input type="checkbox" name="gradoCheck" value="${g}" onchange="toggleChip(this)">
      ${g}
    </label>
  `).join('');
}

function filterAreaChips() {
  const q = (document.getElementById('searchAreaChip').value || '').toLowerCase().trim();
  COLOMBIAN_AREAS.forEach((a, i) => {
    const lbl = document.getElementById(`lblArea_${i}`);
    if (lbl) {
      if (!q || a.toLowerCase().includes(q)) {
        lbl.style.display = 'inline-flex';
      } else {
        lbl.style.display = 'none';
      }
    }
  });
}

function toggleChip(checkbox) {
  const label = checkbox.parentElement;
  if (checkbox.checked) {
    label.classList.add('selected');
  } else {
    label.classList.remove('selected');
  }
}

function autoGenerateEmail() {
  const nombreInput = document.getElementById('nombre').value.trim();
  if (!nombreInput) {
    document.getElementById('correo').value = '';
    return;
  }

  // Generar slug del nombre utilizando los dos primeros nombres
  const cleanStr = nombreInput.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const parts = cleanStr.split(/\s+/).filter(Boolean);

  let username = 'docente';
  if (parts.length >= 2) {
    username = `${parts[0]}.${parts[1]}`;
  } else if (parts.length === 1) {
    username = parts[0];
  }

  // Dominio según sede
  const sedeSelect = document.getElementById('sedeId');
  const selectedSedeObj = sedesData.find(s => s.id == sedeSelect.value);

  let domain = 'guaimaral.edu.co';
  if (selectedSedeObj) {
    const sName = selectedSedeObj.nombre.toLowerCase();
    if (sName.includes('cuatro bocas')) domain = 'cuatrobocas.edu.co';
    else if (sName.includes('altamira')) domain = 'altamira.edu.co';
  }

  document.getElementById('correo').value = `${username}@${domain}`;
}

async function loadOptions() {
  try {
    sedesData = await API.Docentes.getSedes();
    if (!sedesData || sedesData.length === 0) {
      sedesData = [
        { id: 1, nombre: 'I.E. Guaimaral' },
        { id: 2, nombre: 'Sede Cuatro Bocas' },
        { id: 3, nombre: 'Sede Altamira' }
      ];
    }
    const sedesSelect = document.getElementById('sedeId');
    sedesSelect.innerHTML = '<option value="">Seleccione una sede...</option>' + 
      sedesData.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');

    let jornadas = await API.Docentes.getJornadas();
    if (!jornadas || jornadas.length === 0) {
      jornadas = [
        { id: 1, nombre: 'Mañana' },
        { id: 2, nombre: 'Tarde' },
        { id: 3, nombre: 'Nocturna' }
      ];
    }
    const jornadasSelect = document.getElementById('jornadaId');
    jornadasSelect.innerHTML = '<option value="">Seleccione una jornada...</option>' +
      jornadas.map(j => `<option value="${j.id}">${j.nombre}</option>`).join('');
  } catch (err) {
    sedesData = [
      { id: 1, nombre: 'I.E. Guaimaral' },
      { id: 2, nombre: 'Sede Cuatro Bocas' },
      { id: 3, nombre: 'Sede Altamira' }
    ];
    document.getElementById('sedeId').innerHTML = '<option value="">Seleccione una sede...</option>' + 
      sedesData.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');

    const jornadas = [
      { id: 1, nombre: 'Mañana' },
      { id: 2, nombre: 'Tarde' },
      { id: 3, nombre: 'Nocturna' }
    ];
    document.getElementById('jornadaId').innerHTML = '<option value="">Seleccione una jornada...</option>' +
      jornadas.map(j => `<option value="${j.id}">${j.nombre}</option>`).join('');
  }
}

async function loadDocentes() {
  try {
    docentesData = await API.Docentes.getAll();
    renderDocentes(docentesData);
  } catch (err) {
    console.warn('Aviso: no se pudo sincronizar la lista secundaria de docentes', err);
  }
}

function filterDocentes() {
  const input = document.getElementById('searchDocentes');
  if (!input) return;
  const q = (input.value || '').toLowerCase().trim();
  if (!q) {
    renderDocentes(docentesData);
    return;
  }
  const filtered = docentesData.filter(d => 
    (d.nombre || '').toLowerCase().includes(q) ||
    (d.correo || '').toLowerCase().includes(q) ||
    (d.sede_nombre || '').toLowerCase().includes(q) ||
    (d.jornada_nombre || '').toLowerCase().includes(q) ||
    (d.areas || '').toLowerCase().includes(q) ||
    (d.grados || '').toLowerCase().includes(q)
  );
  renderDocentes(filtered);
}

function renderDocentes(list = docentesData) {
  const tbody = document.getElementById('docentesList');
  if (!tbody) return;

  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px;">No se encontraron docentes registrados</td></tr>`;
    return;
  }

  const currentUser = Storage.getUser();
  const isAdmin = currentUser && currentUser.rol === 'administrador';

  tbody.innerHTML = list.map(d => {
    const areasTags = d.areas ? d.areas.split(', ').map(a => `<span class="badge-tag">${a}</span>`).join('') : '<span style="color:var(--text-muted); font-size:12px;">Sin áreas</span>';
    const gradosTags = d.grados ? d.grados.split(', ').map(g => `<span class="badge-grade">${g}</span>`).join('') : '<span style="color:var(--text-muted); font-size:12px;">Sin grados</span>';

    return `
      <tr>
        <td>
          <strong>${d.nombre}</strong><br>
          <div style="margin-top: 4px; font-size: 12px; color: var(--primary-light);">
            📧 <span>${d.correo || 'Sin correo'}</span>
          </div>
        </td>
        <td>
          <strong>${d.sede_nombre || 'Sin Sede'}</strong><br>
          <small style="color: var(--text-muted)">${d.jornada_nombre || 'Sin Jornada'}</small>
        </td>
        <td style="max-width: 200px;">${areasTags}</td>
        <td style="max-width: 150px;">${gradosTags}</td>
        <td style="text-align: center; white-space: nowrap;">
          <button class="btn btn-primary" style="padding: 4px 10px; font-size: 12px; margin-right:4px; background:#0284c7; color:#fff;" onclick="openCredencialModal(${d.id})">📇 Credencial</button>
          ${isAdmin ? `
            <button class="btn btn-warning" style="padding: 4px 10px; font-size: 12px; margin-right:4px; background:#f59e0b; color:#fff; font-weight:700;" onclick="loginAsDocente(${d.id}, '${(d.nombre || '').replace(/'/g, "\\'")}')" title="Ingresar a la cuenta de este docente">🔑 Entrar</button>
          ` : ''}
          <button class="btn btn-light" style="padding: 4px 10px; font-size: 12px; margin-right:4px;" onclick="editDocente(${d.id})">✏️ Editar</button>
          <button class="btn btn-danger" style="padding: 4px 10px; font-size: 12px;" onclick="deleteDocente(${d.id})">🗑️ Eliminar</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function openDocenteExpedienteModalFromDocentesPage(docenteId, docenteNombre) {
  try {
    showToast('⏳ Cargando planeaciones del docente...', 'info');
    const allPlans = await API.Planeaciones.getAll();
    const plans = allPlans.filter(p => String(p.docente_id) === String(docenteId));

    if (!plans || plans.length === 0) {
      showToast(`ℹ️ El docente "${docenteNombre}" no registra planeaciones aún`, 'info');
      return;
    }

    const docSede = plans[0].sede_nombre || 'I.E. Guaimaral';
    const docJornada = plans[0].jornada_nombre || 'Mañana';
    const docDoc = plans[0].docente_doc || '--';

    const existing = document.getElementById('docenteExpedienteModalDocentesPage');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'docenteExpedienteModalDocentesPage';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.85); backdrop-filter:blur(6px); z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:16px; animation: fadeIn 0.2s ease;';

    modal.innerHTML = `
      <div style="background:var(--surface, #1e293b); color:var(--text-main, #f1f5f9); border-radius:16px; max-width:1050px; width:96%; max-height:90vh; display:flex; flex-direction:column; box-shadow: 0 25px 60px rgba(0,0,0,0.5); border:1px solid var(--border, #334155); overflow:hidden;">
        
        <!-- Header Topbar -->
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg, #0f172a); padding:16px 22px; border-bottom:1px solid var(--border, #334155); flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:center; gap:14px;">
            <div style="width:44px; height:44px; border-radius:50%; background:linear-gradient(135deg, #0284c7, #38bdf8); color:#fff; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:bold;">
              ${(docenteNombre || 'D').charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 style="margin:0; font-size:18px; font-weight:700; color:var(--primary-accent, #38bdf8);">
                Expediente de Planeaciones · ${docenteNombre}
              </h3>
              <small style="color:var(--text-muted, #94a3b8); font-size:12px;">
                Documento: ${docDoc} · Sede: ${docSede} · Jornada: ${docJornada}
              </small>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:12px; padding:4px 12px; background:rgba(56,189,248,0.15); color:#38bdf8; border-radius:20px; font-weight:600;">
              📁 ${plans.length} ${plans.length === 1 ? 'Planeación' : 'Planeaciones'}
            </span>
            <button type="button" onclick="document.getElementById('docenteExpedienteModalDocentesPage').remove()" style="background:none; border:none; font-size:26px; cursor:pointer; color:var(--text-muted, #94a3b8); line-height:1; padding:0 6px;">&times;</button>
          </div>
        </div>

        <!-- Body Table -->
        <div style="flex:1; padding:20px; overflow-y:auto; background:var(--surface, #1e293b);">
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
              ${plans.map(p => {
                let pdfUrl = p.nombre_archivo;
                if (pdfUrl && !pdfUrl.startsWith('http://') && !pdfUrl.startsWith('https://')) {
                  pdfUrl = `https://bulrbsaoxwuibslfhlef.supabase.co/storage/v1/object/public/planeaciones_pdfs/${p.nombre_archivo}`;
                }
                const rawName = p.nombre_archivo ? p.nombre_archivo.split('/').pop().split('?')[0].replace(/^\d+_[_\-]*/, '') : 'Planeacion.pdf';
                const cleanName = rawName.endsWith('.pdf') ? rawName : `${rawName}.pdf`;

                return `
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
              }).join('')}
            </tbody>
          </table>
        </div>

      </div>
    `;

    document.body.appendChild(modal);
  } catch (err) {
    showToast('Error al cargar expediente del docente', 'error');
  }
}

async function saveDocente(e) {
  e.preventDefault();
  const id = document.getElementById('docenteId').value;

  const areasSel = Array.from(document.querySelectorAll('input[name="areaCheck"]:checked')).map(c => c.value);
  const gradosSel = Array.from(document.querySelectorAll('input[name="gradoCheck"]:checked')).map(c => c.value);

  if (areasSel.length === 0) {
    showToast('Por favor seleccione al menos un área/asignatura', 'error');
    return;
  }

  if (gradosSel.length === 0) {
    showToast('Por favor seleccione al menos un grado académico', 'error');
    return;
  }

  const payload = {
    nombre: document.getElementById('nombre').value.trim(),
    correo: document.getElementById('correo').value.trim() || null,
    sede_id: document.getElementById('sedeId').value ? parseInt(document.getElementById('sedeId').value) : null,
    jornada_id: document.getElementById('jornadaId').value ? parseInt(document.getElementById('jornadaId').value) : null,
    areas: areasSel.join(', '),
    grados: gradosSel.join(', ')
  };

  const pwdVal = document.getElementById('password').value.trim();
  if (pwdVal) {
    payload.password = pwdVal;
  }

  try {
    if (id) {
      await API.Docentes.update(id, payload);
      showToast('Docente actualizado con éxito', 'success');
    } else {
      await API.Docentes.create(payload);
      showToast('Docente creado con éxito y usuario habilitado', 'success');
    }
    resetForm();
    await loadDocentes();
  } catch (err) {
    showToast(err.message || 'Error al guardar docente', 'error');
  }
}

function editDocente(id) {
  const d = docentesData.find(x => x.id === id);
  if (!d) return;

  document.getElementById('docenteId').value = d.id;
  document.getElementById('nombre').value = d.nombre || '';
  document.getElementById('correo').value = d.correo || '';
  document.getElementById('sedeId').value = d.sede_id || '';
  document.getElementById('jornadaId').value = d.jornada_id || '';

  // Mostrar campo de contraseña con la clave actual para permitir editarla
  document.getElementById('passwordRow').style.display = 'grid';
  document.getElementById('password').value = d.clave_inicial || 'admin123';

  // Marcar Áreas
  const teacherAreas = d.areas ? d.areas.split(', ') : [];
  document.querySelectorAll('input[name="areaCheck"]').forEach(chk => {
    chk.checked = teacherAreas.includes(chk.value);
    toggleChip(chk);
  });

  // Marcar Grados
  const teacherGrades = d.grados ? d.grados.split(', ') : [];
  document.querySelectorAll('input[name="gradoCheck"]').forEach(chk => {
    chk.checked = teacherGrades.includes(chk.value);
    toggleChip(chk);
  });

  document.getElementById('formTitle').textContent = 'Editar Docente';
  document.getElementById('btnSave').textContent = 'Actualizar Docente';
  document.getElementById('btnCancel').style.display = 'inline-flex';
}

async function deleteDocente(id) {
  if (!confirm('¿Está seguro de que desea eliminar este docente y su cuenta de usuario?')) return;
  try {
    await API.Docentes.remove(id);
    showToast('Docente y su usuario eliminados', 'success');
    await loadDocentes();
  } catch (err) {
    showToast(err.message || 'Error al eliminar docente', 'error');
  }
}

function resetForm() {
  document.getElementById('docenteForm').reset();
  document.getElementById('docenteId').value = '';
  
  document.getElementById('passwordRow').style.display = 'grid';
  document.getElementById('password').value = '';

  document.querySelectorAll('input[name="areaCheck"], input[name="gradoCheck"]').forEach(chk => {
    chk.checked = false;
    toggleChip(chk);
  });
  document.getElementById('formTitle').textContent = 'Registrar Docente';
  document.getElementById('btnSave').textContent = 'Guardar Docente';
  document.getElementById('btnCancel').style.display = 'none';
}

function openCredencialModal(docenteId) {
  const d = docentesData.find(x => x.id === docenteId);
  if (!d) {
    showToast('Docente no encontrado', 'error');
    return;
  }

  const existing = document.getElementById('credencialModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'credencialModal';
  modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.85); backdrop-filter:blur(8px); z-index:99999; display:flex; align-items:center; justify-content:center; padding:16px; animation: fadeIn 0.25s ease;';

  const clave = d.clave_inicial || 'admin123';
  const avatarLetter = (d.nombre || 'D').charAt(0).toUpperCase();

  modal.innerHTML = `
    <div style="background:var(--surface, #ffffff); color:var(--text-main, #0f172a); border-radius:20px; max-width:480px; width:95%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.35); border:1px solid var(--border, #e2e8f0); overflow:hidden; display:flex; flex-direction:column;">
      
      <!-- Header Topbar -->
      <div style="background:#0f172a; color:#fff; padding:14px 20px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:14px; font-weight:700; letter-spacing:0.5px; display:flex; align-items:center; gap:8px;">
          📇 CARNÉ & CREDENCIAL INSTITUCIONAL
        </span>
        <button onclick="document.getElementById('credencialModal').remove()" style="background:none; border:none; color:#94a3b8; font-size:22px; cursor:pointer; line-height:1;">&times;</button>
      </div>

      <!-- Credencial Card View -->
      <div id="printTargetCard" style="padding:24px; background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);">
        
        <div style="background: #ffffff; border-radius: 16px; border: 2px solid #0284c7; box-shadow: 0 10px 25px rgba(2, 132, 199, 0.15); overflow: hidden; position: relative;">
          
          <!-- Card Header Band -->
          <div style="background: linear-gradient(135deg, #0369a1 0%, #0284c7 100%); color: #ffffff; padding: 14px; text-align: center; position: relative;">
            <div style="display:flex; align-items:center; justify-content:center; gap:10px;">
              <img src="assets/img/escudo.png" alt="Escudo" style="height: 38px; width: auto; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));" onerror="this.style.display='none'">
              <div>
                <h4 style="margin:0; font-size:13px; font-weight:800; letter-spacing:1px; text-transform:uppercase;">I.E. GUAIMARAL</h4>
                <p style="margin:2px 0 0 0; font-size:10px; opacity:0.9; text-transform:uppercase; font-weight:600;">Carné Oficial de Docente</p>
              </div>
            </div>
          </div>

          <!-- Card Body -->
          <div style="padding: 20px; text-align: center;">
            <div style="width: 72px; height: 72px; margin: 0 auto 12px auto; border-radius: 50%; background: linear-gradient(135deg, #0284c7, #38bdf8); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 30px; font-weight: 800; box-shadow: 0 4px 12px rgba(2,132,199,0.3); border: 3px solid #fff;">
              ${avatarLetter}
            </div>

            <h3 style="margin:0 0 4px 0; font-size:18px; font-weight:800; color:#0f172a;">${d.nombre}</h3>
            <span style="display:inline-block; font-size:11px; font-weight:700; background:#e0f2fe; color:#0369a1; padding:3px 12px; border-radius:12px; margin-bottom:14px; text-transform:uppercase;">
              Docente Institucional
            </span>

            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px; text-align:left; font-size:12px; margin-bottom:14px;">
              <div style="margin-bottom:6px; display:flex; align-items:center; justify-content:space-between;">
                <span style="color:#64748b; font-weight:600;">📧 Correo:</span>
                <strong style="color:#0f172a; word-break:break-all;">${d.correo || 'Sin correo registrado'}</strong>
              </div>
              <div style="margin-bottom:6px; display:flex; align-items:center; justify-content:space-between;">
                <span style="color:#64748b; font-weight:600;">🔑 Clave de Acceso:</span>
                <strong style="color:#0284c7; font-family:monospace; font-size:13px;">${clave}</strong>
              </div>
              <div style="margin-bottom:6px; display:flex; align-items:center; justify-content:space-between;">
                <span style="color:#64748b; font-weight:600;">🏛️ Sede:</span>
                <span style="color:#334155; font-weight:600;">${d.sede_nombre || 'I.E. Guaimaral'}</span>
              </div>
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <span style="color:#64748b; font-weight:600;">☀️ Jornada:</span>
                <span style="color:#334155; font-weight:600;">${d.jornada_nombre || 'Mañana'}</span>
              </div>
            </div>

            ${d.areas ? `
              <div style="text-align:left; font-size:11px; margin-bottom:10px;">
                <strong style="color:#475569; display:block; margin-bottom:4px;">📚 Áreas Asignadas:</strong>
                <div style="display:flex; flex-wrap:wrap; gap:4px;">
                  ${d.areas.split(', ').map(a => `<span style="background:#f1f5f9; color:#334155; padding:2px 8px; border-radius:6px; border:1px solid #cbd5e1;">${a}</span>`).join('')}
                </div>
              </div>
            ` : ''}

            ${d.grados ? `
              <div style="text-align:left; font-size:11px; margin-bottom:12px;">
                <strong style="color:#475569; display:block; margin-bottom:4px;">🎓 Grados:</strong>
                <div style="display:flex; flex-wrap:wrap; gap:4px;">
                  ${d.grados.split(', ').map(g => `<span style="background:#e0e7ff; color:#3730a3; padding:2px 8px; border-radius:6px; font-weight:600;">${g}</span>`).join('')}
                </div>
              </div>
            ` : ''}

            <div style="display:flex; align-items:center; justify-content:center; gap:8px; margin-top:10px; color:#94a3b8; font-size:10px;">
              <span>⚡ Credencial Activa & Verificada · I.E. Guaimaral</span>
            </div>
          </div>

        </div>

      </div>

      <!-- Footer Buttons -->
      <div style="padding:16px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; flex-wrap:wrap; gap:10px; justify-content:space-between; align-items:center;">
        <button type="button" class="btn btn-light" style="padding:8px 14px; font-size:12px;" onclick="copyDocenteCredencial('${d.correo}', '${clave}')">
          📋 Copiar Credenciales
        </button>
        <div style="display:flex; gap:8px;">
          <button type="button" class="btn btn-primary" style="padding:8px 14px; font-size:12px; background:#0284c7;" onclick="printDocenteCredencial('${(d.nombre || '').replace(/'/g, "\\'")}')">
            🖨️ Imprimir / PDF
          </button>
          <button type="button" class="btn btn-danger" style="padding:8px 14px; font-size:12px;" onclick="document.getElementById('credencialModal').remove()">
            Cerrar
          </button>
        </div>
      </div>

    </div>
  `;

  document.body.appendChild(modal);
}

function copyDocenteCredencial(correo, clave) {
  const text = `Credenciales de Acceso I.E. Guaimaral:\n📧 Correo: ${correo}\n🔑 Contraseña: ${clave}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('📋 Credenciales copiadas al portapapeles', 'success');
    }).catch(() => {
      showToast(`Correo: ${correo} | Clave: ${clave}`, 'info');
    });
  } else {
    showToast(`Correo: ${correo} | Clave: ${clave}`, 'info');
  }
}

function printDocenteCredencial(docenteNombre) {
  const cardContent = document.getElementById('printTargetCard');
  if (!cardContent) return;

  const printWin = window.open('', '_blank', 'width=600,height=750');
  printWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Credencial - ${docenteNombre || 'Docente'}</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 20px; background: #ffffff; display: flex; justify-content: center; }
        @media print {
          body { background: #ffffff; padding: 0; }
        }
      </style>
    </head>
    <body>
      <div style="max-width: 420px; width: 100%;">
        ${cardContent.innerHTML}
      </div>
      <script>
        window.onload = function() {
          window.print();
          setTimeout(function() { window.close(); }, 500);
        };
      </script>
    </body>
    </html>
  `);
  printWin.document.close();
}
