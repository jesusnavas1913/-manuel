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
    const sedesSelect = document.getElementById('sedeId');
    sedesSelect.innerHTML = '<option value="">Seleccione una sede...</option>' + 
      sedesData.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');

    const jornadas = await API.Docentes.getJornadas();
    const jornadasSelect = document.getElementById('jornadaId');
    jornadasSelect.innerHTML = '<option value="">Seleccione una jornada...</option>' +
      jornadas.map(j => `<option value="${j.id}">${j.nombre}</option>`).join('');
  } catch (err) {
    showToast('Error al cargar opciones de sedes y jornadas', 'error');
  }
}

async function loadDocentes() {
  try {
    docentesData = await API.Docentes.getAll();
    renderDocentes(docentesData);
  } catch (err) {
    showToast('Error al obtener docentes', 'error');
  }
}

function filterDocentes() {
  const q = (document.getElementById('searchDocentes').value || '').toLowerCase().trim();
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
  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px;">No se encontraron docentes registrados</td></tr>`;
    return;
  }

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
          <button class="btn btn-light" style="padding: 4px 10px; font-size: 12px;" onclick="editDocente(${d.id})">Editar</button>
          <button class="btn btn-danger" style="padding: 4px 10px; font-size: 12px;" onclick="deleteDocente(${d.id})">Eliminar</button>
        </td>
      </tr>
    `;
  }).join('');
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
