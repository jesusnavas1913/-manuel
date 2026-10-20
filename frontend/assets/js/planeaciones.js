let docentesList = [];

const ALL_COLOMBIAN_AREAS = [
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

const ALL_COLOMBIAN_GRADES = [
  'Prejardín', 'Jardín', 'Transición',
  '1°', '2°', '3°', '4°', '5°',
  '6°', '7°', '8°', '9°',
  '10°', '11°', 'Multigrado'
];

async function populateDocenteAreasAndGrados() {
  const user = Storage.getUser();
  const areaSelect = document.getElementById('area');
  const gradoSelect = document.getElementById('grado');
  if (!areaSelect || !gradoSelect) return;

  let assignedAreas = [];
  let assignedGrados = [];

  if (user) {
    try {
      if (!docentesList || docentesList.length === 0) {
        docentesList = await API.Docentes.getAll();
      }
      const did = user.docente_id;
      const userMail = (user.correo || '').toLowerCase().trim();
      const userName = (user.nombre || '').toLowerCase().trim();

      let myDoc = docentesList.find(d => did && String(d.id) === String(did));
      if (!myDoc && userMail) {
        myDoc = docentesList.find(d => d.correo && d.correo.toLowerCase().trim() === userMail);
      }
      if (!myDoc && userName) {
        myDoc = docentesList.find(d => d.nombre && d.nombre.toLowerCase().trim() === userName);
      }

      if (myDoc) {
        if (myDoc.areas) assignedAreas = myDoc.areas.split(',').map(s => s.trim()).filter(Boolean);
        if (myDoc.grados) assignedGrados = myDoc.grados.split(',').map(s => s.trim()).filter(Boolean);
      }
    } catch (e) {
      console.warn('Error obteniendo asignaciones de docente:', e);
    }
  }

  // Poblar áreas
  let areaHtml = '<option value="">Seleccione el área o asignatura...</option>';
  if (assignedAreas.length > 0) {
    areaHtml += `<optgroup label="⭐ Mis Asignaturas Asignadas">`;
    assignedAreas.forEach(a => {
      areaHtml += `<option value="${a}">${a}</option>`;
    });
    areaHtml += `</optgroup>`;
    const otherAreas = ALL_COLOMBIAN_AREAS.filter(a => !assignedAreas.includes(a));
    if (otherAreas.length > 0) {
      areaHtml += `<optgroup label="Otras Áreas Institucionales">`;
      otherAreas.forEach(a => {
        areaHtml += `<option value="${a}">${a}</option>`;
      });
      areaHtml += `</optgroup>`;
    }
  } else {
    ALL_COLOMBIAN_AREAS.forEach(a => {
      areaHtml += `<option value="${a}">${a}</option>`;
    });
  }
  areaSelect.innerHTML = areaHtml;

  // Poblar grados
  let gradoHtml = '<option value="">Seleccione el grado académico...</option>';
  if (assignedGrados.length > 0) {
    gradoHtml += `<optgroup label="⭐ Mis Grados Asignados">`;
    assignedGrados.forEach(g => {
      gradoHtml += `<option value="${g}">${g}</option>`;
    });
    gradoHtml += `</optgroup>`;
    const otherGrados = ALL_COLOMBIAN_GRADES.filter(g => !assignedGrados.includes(g));
    if (otherGrados.length > 0) {
      gradoHtml += `<optgroup label="Otros Grados">`;
      otherGrados.forEach(g => {
        gradoHtml += `<option value="${g}">${g}</option>`;
      });
      gradoHtml += `</optgroup>`;
    }
  } else {
    ALL_COLOMBIAN_GRADES.forEach(g => {
      gradoHtml += `<option value="${g}">${g}</option>`;
    });
  }
  gradoSelect.innerHTML = gradoHtml;
}

async function initPlaneacionesPage() {
  startLiveClock();
  populateDocenteWeekSelect();

  const user = Storage.getUser();
  const formCard = document.getElementById('formCard');
  const listCard = document.getElementById('listCard');
  const adminDocentesCard = document.getElementById('adminDocentesCard');

  const role = (user && user.rol ? user.rol : '').toLowerCase().trim();
  const isAdmin = !user?.docente_id && (role === 'administrador' || role === 'admin');

  if (isAdmin) {
    // Administrador: Mostrar listado completo de Docentes con su botón de Expediente de Planeaciones
    if (formCard) formCard.style.display = 'none';
    if (listCard) listCard.style.display = 'none';
    if (adminDocentesCard) adminDocentesCard.style.display = 'block';

    populateAdminWeekSelect();
    updateAdminWeeklySummary();

    const urlParams = new URLSearchParams(window.location.search);
    const filterParam = urlParams.get('filter');
    if (filterParam === 'pending' || filterParam === 'ok' || filterParam === 'all') {
      currentAdminDocenteFilter = filterParam;
      setAdminDocenteFilter(filterParam);
    }
    if (urlParams.get('diagnostico') === 'true') {
      setTimeout(() => openDiagnosticoModal(), 350);
    }

    try {
      await loadAdminDocentes();
    } catch (e) { console.error('Error cargando docentes admin:', e); }
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

    try {
      await populateDocenteAreasAndGrados();
    } catch (e) { console.warn('Error áreas docente:', e); }

    try {
      await loadPlaneaciones();
    } catch (e) { console.error('Error cargando planeaciones docente:', e); }
  }
}

const MIN_SEMANA_LECTIVA = 1; // Habilitar semanas completas del año escolar
const SUPABASE_STORAGE_BUCKET_URL = 'https://fawxjdiwtamkctrhtqzc.supabase.co/storage/v1/object/planeaciones_pdfs';
const SUPABASE_STORAGE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhd3hqZGl3dGFta2N0cmh0cXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNjg3ODIsImV4cCI6MjEwNzY0NDc4Mn0.JlNRraj9g_JJQ6yRxtL20edTKVKylnxN-UBBJ7h0TrU';

async function uploadPdfDirectToStorage(file) {
  if (file && file.size > 50 * 1024 * 1024) {
    throw new Error('El archivo PDF supera el tamaño máximo permitido de 50 MB.');
  }
  const rawClean = (file.name || 'planeacion.pdf').replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const safeName = `${Date.now()}_${rawClean.toLowerCase().endsWith('.pdf') ? rawClean : `${rawClean}.pdf`}`;

  // 1. Método 1 (Recomendado): Signed Upload URL pre-autorizada por backend
  // Inmune al límite de 4.5 MB de Vercel y sin bloqueos de políticas RLS en Supabase
  try {
    const token = Storage.getToken();
    const endpointUrl = (typeof API_BASE !== 'undefined' ? API_BASE : '/api');
    const signRes = await fetch(`${endpointUrl}/planeaciones/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ fileName: file.name || 'planeacion.pdf' })
    });

    if (signRes.ok) {
      const signData = await signRes.json();
      if (signData && signData.signedUrl) {
        const uploadRes = await fetch(signData.signedUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/pdf'
          },
          body: file
        });

        if (uploadRes.ok) {
          console.log('✅ Archivo PDF subido exitosamente vía Signed URL:', signData.publicUrl);
          return signData.publicUrl;
        } else {
          console.warn('Subida PUT Signed URL devolvió status:', uploadRes.status);
        }
      }
    }
  } catch (signErr) {
    console.warn('Nota Signed Upload URL, procediendo con fallback:', signErr);
  }

  // 2. Método 2 (Fallback directo a Supabase con clave anónima)
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

  if (res.ok) {
    return `https://fawxjdiwtamkctrhtqzc.supabase.co/storage/v1/object/public/planeaciones_pdfs/${safeName}`;
  }

  const errData = await res.json().catch(() => ({}));
  throw new Error(errData.message || 'Error al subir el archivo PDF a almacenamiento');
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

function getActiveAcademicWeek(d = new Date()) {
  const date = new Date(d.valueOf());
  const isoW = weekNumber(date);
  const day = date.getDay(); // 0: Dom, 1: Lun, ..., 5: Vie, 6: Sab
  // Desde el viernes (5), sábado (6) y domingo (0) se abre y activa la semana siguiente
  const targetW = (day === 5 || day === 6 || day === 0) ? (isoW + 1) : isoW;
  return Math.max(36, targetW);
}

function getCurrentAcademicWeek(d = new Date()) {
  return getActiveAcademicWeek(d);
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
  const currentW = getActiveAcademicWeek(now);
  const dayOfWeek = now.getDay();
  const defaultW = currentW;

  let optionsHtml = '';
  // Permitir semanas futuras (hasta 2 semanas de preparación pedagógica anticipada)
  const maxW = currentW + 2;
  for (let w = maxW; w >= EVALUACION_INICIO_SEMANA; w--) {
    const isCur = w === currentW;
    const isFuture = w > currentW;
    let label = `Semana ${w}`;
    if (isFuture) {
      label = `Semana ${w} (Planeación Anticipada / Habilitada)`;
    } else if (isCur) {
      if (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) {
        label = `Semana ${w} (Semana Activa - Abierta desde Viernes)`;
      } else {
        label = `Semana ${w} (Semana Actual - En Curso)`;
      }
    } else {
      label = `Semana ${w} (Anterior)`;
    }

    const isSel = w === defaultW;
    optionsHtml += `<option value="${w}" ${isSel ? 'selected' : ''}>${label}</option>`;
  }

  sel.innerHTML = optionsHtml;

  const mondayDefaultStr = getMondayOfISOWeek(defaultW);
  const dateInput = document.getElementById('fechaAplicacion');
  if (dateInput) {
    dateInput.value = mondayDefaultStr;
    // Permitir hasta 45 días en el futuro para que el calendario nativo nunca bloquee planeaciones anticipadas
    const maxFutureDate = new Date();
    maxFutureDate.setDate(maxFutureDate.getDate() + 45);
    dateInput.max = maxFutureDate.toISOString().split('T')[0];
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
let selectedAdminWeek = getActiveAcademicWeek();
const EVALUACION_INICIO_SEMANA = 32;

let institutionalWeeksData = [];
const DEFAULT_INST_WEEKS = [13, 25, 26, 41, 49, 50];

function isWeekInstitutional(weekNumber) {
  const w = parseInt(weekNumber, 10);
  if (isNaN(w)) return false;
  if (DEFAULT_INST_WEEKS.includes(w)) return true;
  return (institutionalWeeksData || []).some(i => parseInt(i.numero_semana, 10) === w);
}

function canonicalizeDocentesList(docs) {
  if (!Array.isArray(docs)) return [];
  const map = new Map();
  
  docs.forEach(d => {
    const rawName = (d.nombre || '').toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ').trim();
    
    let key = rawName;
    if (rawName.includes('jorge') && rawName.includes('ferrer')) key = 'jorge luis ferrer solano';
    else if (rawName.includes('jorge') && rawName.includes('hoz')) key = 'jorge de la hoz maldonado';
    else if (rawName.includes('carlos') && rawName.includes('sandoval')) key = 'carlos de jesus sandoval penaloza';
    else if (rawName.includes('martin') && rawName.includes('celin')) key = 'martin alonso celin molinares';
    else if (rawName.includes('jairo') && rawName.includes('benavides')) key = 'jairo alonso benavides bustillo';
    else if (rawName.includes('jairo') && rawName.includes('blanco')) key = 'jairo enrique blanco nieto';
    else if (rawName.includes('aleida') && rawName.includes('lara')) key = 'aleida ines lara castro';
    else if (rawName.includes('rocio') && rawName.includes('ramirez')) key = 'rocio del carmen ramirez montiel';
    else if (rawName.includes('liliana') && rawName.includes('valle')) key = 'liliana yazmin valle rodriguez';
    else if (rawName.includes('estefany') && rawName.includes('verbel')) key = 'estefany paola verbel barreto';
    else if (rawName.includes('evaristo') && rawName.includes('bertel')) key = 'evaristo jose bertel beleno';
    else if (rawName.includes('ibeth') && rawName.includes('charris')) key = 'ibeth esther charris celin';
    else if (rawName.includes('leovigilda') && rawName.includes('cuentas')) key = 'leovigilda cuentas ariza';
    else if (rawName.includes('linda') && rawName.includes('varela')) key = 'linda patricia varela rodriguez';
    else if (rawName.includes('nancy') && rawName.includes('vargas')) key = 'nancy esther vargas lara';
    else if (rawName.includes('roberto') && rawName.includes('daza')) key = 'roberto carlos daza angulo';
    else if (rawName.includes('alex') && rawName.includes('sanjuan')) key = 'alex enrique sanjuan pachon';
    else if (rawName.includes('deisy') && rawName.includes('mercado')) key = 'deisy del carmen mercado vasquez';
    else if (rawName.includes('paula') && rawName.includes('padilla')) key = 'paula andrea padilla roncallo';
    else if (rawName.includes('asterio') && rawName.includes('torres')) key = 'asterio manuel torres gamez';
    else if (rawName.includes('eduardo') && rawName.includes('alonso')) key = 'eduardo rafael alonso romero';
    else if (!key && d.correo) key = d.correo.toLowerCase().trim().split('@')[0];

    if (!map.has(key)) {
      const linked = Array.isArray(d.linked_ids) ? [...d.linked_ids] : [d.id];
      if (!linked.includes(d.id)) linked.push(d.id);
      map.set(key, { ...d, linked_ids: linked });
    } else {
      const exist = map.get(key);
      if (!exist.linked_ids.includes(d.id)) exist.linked_ids.push(d.id);
      if (Array.isArray(d.linked_ids)) {
        d.linked_ids.forEach(id => { if (!exist.linked_ids.includes(id)) exist.linked_ids.push(id); });
      }
      if ((d.nombre || '').length > (exist.nombre || '').length) exist.nombre = d.nombre;
      if (d.documento && !exist.documento) exist.documento = d.documento;
      if (d.correo && !exist.correo) exist.correo = d.correo;
      if (d.sede_nombre && !exist.sede_nombre) exist.sede_nombre = d.sede_nombre;
      
      const aSet = new Set((exist.areas || '').split(/[,;]+/).map(s => s.trim()).filter(Boolean));
      (d.areas || '').split(/[,;]+/).map(s => s.trim()).filter(Boolean).forEach(a => aSet.add(a));
      exist.areas = Array.from(aSet).join(', ');

      const gSet = new Set((exist.grados || '').split(/[,;]+/).map(s => s.trim()).filter(Boolean));
      (d.grados || '').split(/[,;]+/).map(s => s.trim()).filter(Boolean).forEach(g => gSet.add(g));
      exist.grados = Array.from(gSet).join(', ');
    }
  });

  return Array.from(map.values());
}

async function loadAdminDocentes() {
  try {
    const [docs, plans, instWeeks] = await Promise.all([
      API.Docentes.getAll().catch(e => { console.error('Error docentes:', e); return []; }),
      API.Planeaciones.getAll().catch(e => { console.error('Error planeaciones:', e); return []; }),
      API.Semanas.getAll().catch(e => { console.warn('Error semanas:', e); return []; })
    ]);

    adminDocentesData = canonicalizeDocentesList(Array.isArray(docs) ? docs : []);
    docentesList = adminDocentesData;
    allPlaneaciones = Array.isArray(plans) ? plans : [];
    institutionalWeeksData = Array.isArray(instWeeks) ? instWeeks : [];

    // Llenar select de docentes en segundo plano para el modal
    const sel = document.getElementById('docenteId');
    if (sel && docentesList.length > 0) {
      sel.innerHTML = '<option value="">Seleccione docente...</option>' + 
        docentesList.map(d => `<option value="${d.id}">${d.nombre} (${d.sede_nombre || 'Sin Sede'})</option>`).join('');
    }

    populateAdminWeekSelect();
    updateAdminWeeklySummary();
    filterAdminDocentes();
  } catch (err) {
    console.error('Error en loadAdminDocentes:', err);
    renderAdminDocentes(adminDocentesData || []);
  }
}

function populateAdminWeekSelect() {
  const sel = document.getElementById('selAdminWeek');
  if (!sel) return;

  const currentW = getActiveAcademicWeek();
  if (!selectedAdminWeek) selectedAdminWeek = currentW;

  let optionsHtml = '';
  for (let w = currentW; w >= EVALUACION_INICIO_SEMANA; w--) {
    const isCur = w === currentW;
    const isSel = w === selectedAdminWeek;
    const isInst = isWeekInstitutional(w);
    let label = `Semana ${w}`;
    if (isInst) label += ' (Institucional / Receso)';
    else if (isCur) label += ' (Actual)';
    optionsHtml += `<option value="${w}" ${isSel ? 'selected' : ''}>${label}</option>`;
  }
  sel.innerHTML = optionsHtml;
}

function changeAdminSelectedWeek(val) {
  selectedAdminWeek = parseInt(val) || getActiveAcademicWeek();
  updateAdminWeeklySummary();
  filterAdminDocentes();
}

function updateAdminWeeklySummary() {
  const currentW = getActiveAcademicWeek();
  const targetW = selectedAdminWeek || currentW;
  const isTargetInst = isWeekInstitutional(targetW);

  const currentWeekLabel = document.getElementById('adminCurrentWeekLabel');
  if (currentWeekLabel) {
    let text = `Semana ${targetW}`;
    if (isTargetInst) text += ' (Semana Institucional / Receso)';
    else if (targetW === currentW) text += ' (Actual)';
    currentWeekLabel.textContent = text;
  }

  let okCount = 0;
  let pendingCount = 0;

  (adminDocentesData || []).forEach(d => {
    const targetIds = (d.linked_ids && d.linked_ids.length > 0) ? d.linked_ids.map(String) : [String(d.id)];
    const deliveredCount = (allPlaneaciones || []).filter(p => 
      targetIds.includes(String(p.docente_id)) && 
      parseInt(p.numero_semana) === targetW && 
      p.estado !== 'no_entrego'
    ).length;
    const hasWeekDelivery = deliveredCount >= 1;
    if (hasWeekDelivery) okCount++;
    else pendingCount++;
  });

  const statOk = document.getElementById('statDocentesOk');
  if (statOk) {
    statOk.textContent = isTargetInst ? `🔵 Subieron Opcional: ${okCount}` : `🟢 Entregaron: ${okCount}`;
  }

  const statPending = document.getElementById('statDocentesPending');
  if (statPending) {
    statPending.textContent = isTargetInst ? `⚪ Receso Oficial (No exigible)` : `🔴 Sin Entregar: ${pendingCount}`;
  }
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
  const q = (document.getElementById('searchAdminDocentes')?.value || '').toLowerCase().trim();
  const sFilter = (document.getElementById('selAdminSede')?.value || '').toLowerCase().trim();
  const targetW = selectedAdminWeek || getActiveAcademicWeek();
  const isTargetInst = isWeekInstitutional(targetW);

  let list = (adminDocentesData || []).filter(d => {
    const stats = getDocenteComplianceStats(d.id, targetW);
    const targetIds = (d.linked_ids && d.linked_ids.length > 0) ? d.linked_ids.map(String) : [String(d.id)];
    const deliveredCount = (allPlaneaciones || []).filter(p => 
      targetIds.includes(String(p.docente_id)) && 
      parseInt(p.numero_semana) === targetW && 
      p.estado !== 'no_entrego'
    ).length;
    const hasWeekDelivery = deliveredCount >= 1;

    if (currentAdminDocenteFilter === 'pending') {
      return isTargetInst ? stats.missingWeeks.length > 0 : !hasWeekDelivery;
    }
    if (currentAdminDocenteFilter === 'ok') {
      return isTargetInst ? stats.missingWeeks.length === 0 : hasWeekDelivery;
    }
    return true;
  });

  if (sFilter) {
    list = list.filter(d => (d.sede_nombre || '').toLowerCase().includes(sFilter));
  }

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
  const doc = (adminDocentesData || []).find(d => String(d.id) === String(docenteId) || (d.linked_ids && d.linked_ids.map(String).includes(String(docenteId))));
  const targetIds = (doc && doc.linked_ids && doc.linked_ids.length > 0) ? doc.linked_ids.map(String) : [String(docenteId)];

  const docPlans = (allPlaneaciones || []).filter(p => targetIds.includes(String(p.docente_id)));
  const validPlans = docPlans.filter(p => p.estado !== 'no_entrego');
  const totalSubidas = validPlans.length;

  const weekCounts = {};
  validPlans.forEach(p => {
    const w = parseInt(p.numero_semana);
    if (w) weekCounts[w] = (weekCounts[w] || 0) + 1;
  });

  const deliveredWeeks = Object.keys(weekCounts)
    .map(Number)
    .filter(w => weekCounts[w] >= MIN_REQUERIDO)
    .sort((a, b) => a - b);

  const startW = Math.min(EVALUACION_INICIO_SEMANA, targetWeek);

  const missingWeeks = [];
  for (let w = startW; w <= targetWeek; w++) {
    // Si la semana es institucional / receso escolar, NO se exige entrega y NO se cuenta como faltante
    if (isWeekInstitutional(w)) continue;

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

  const targetW = selectedAdminWeek || getActiveAcademicWeek();
  const isTargetInst = isWeekInstitutional(targetW);

  tbody.innerHTML = list.map(d => {
    const areasTags = d.areas ? d.areas.split(/[,;]+/).map(s => s.trim()).filter(Boolean).map(a => `<span class="badge-tag" style="display:inline-block; margin:2px; font-size:11px; padding:3px 8px; background:rgba(56,189,248,0.15); color:var(--primary-accent,#38bdf8); border-radius:6px;">${a}</span>`).join('') : '<span style="color:var(--text-muted); font-size:12px;">Sin áreas</span>';
    const gradosTags = d.grados ? d.grados.split(/[,;]+/).map(s => s.trim()).filter(Boolean).map(g => `<span class="badge-grade" style="display:inline-block; margin:2px; font-size:11px; padding:3px 8px; background:rgba(245,158,11,0.15); color:#f59e0b; border-radius:6px;">${g}</span>`).join('') : '<span style="color:var(--text-muted); font-size:12px;">Sin grados</span>';
    
    const stats = getDocenteComplianceStats(d.id, targetW);

    let statusSemanaHtml = '';
    if (isTargetInst) {
      if (stats.hasTargetWeekDelivery) {
        statusSemanaHtml = `<span class="badge info" style="font-size:11px; padding:4px 10px; background:rgba(56,189,248,0.2); color:#38bdf8; border:1px solid rgba(56,189,248,0.4);">🔵 Semana institucional (Subió opcional)</span>`;
      } else {
        statusSemanaHtml = `<span class="badge" style="font-size:11px; padding:4px 10px; background:rgba(148,163,184,0.18); color:#94a3b8; border:1px solid rgba(148,163,184,0.35);">⚪ Semana Institucional / Receso</span>`;
      }
      if (stats.missingWeeks.length > 0) {
        statusSemanaHtml += `<br><small style="color:#f59e0b; font-size:11px; font-weight:600;">Debe anteriores: ${stats.missingWeeks.map(w => `Sem ${w}`).join(', ')}</small>`;
      } else {
        statusSemanaHtml += `<br><small style="color:var(--text-muted); font-size:11px;">Descanso oficial · Sin exigencia de entrega</small>`;
      }
    } else if (stats.missingWeeks.length === 0) {
      statusSemanaHtml = `<span class="badge ok" style="font-size:11px; padding:4px 10px;">🟢 Al día (Sem ${targetW})</span><br><small style="color:var(--text-muted); font-size:11px;">Al día en todas las semanas (${stats.startW}-${targetW}) · Subidas: <strong>${stats.totalSubidas}</strong></small>`;
    } else if (stats.hasTargetWeekDelivery) {
      statusSemanaHtml = `<span class="badge ok" style="font-size:11px; padding:4px 10px;">🟢 Entregó (Sem ${targetW})</span><br><small style="color:#f59e0b; font-size:11px; font-weight:600;">Debe anteriores: ${stats.missingWeeks.map(w => `Sem ${w}`).join(', ')}</small>`;
    } else {
      statusSemanaHtml = `<span class="badge no" style="font-size:11px; padding:4px 10px;">🔴 Sin entrega (Sem ${targetW})</span><br><small style="color:#ef4444; font-size:11px; font-weight:600;">Faltan: ${stats.missingWeeks.map(w => `Sem ${w}`).join(', ')}</small>`;
    }

    return `
      <tr style="border-bottom: 1px solid var(--border, #334155);">
        <td style="padding: 12px 10px;">
          <strong style="font-size: 13px; color: var(--text-main, #f1f5f9);">${d.nombre}</strong><br>
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
          <button class="btn btn-warning" onclick="loginAsDocente(${d.id}, '${(d.nombre || '').replace(/['"]/g, '')}')" style="padding: 6px 10px; font-size: 12px; font-weight: 700; background: #f59e0b; color: #ffffff; border: none; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; margin-right: 4px;" title="Ingresar a la cuenta de este docente">
            🔑 Entrar
          </button>
          <button class="btn btn-primary" onclick="openDocenteExpedienteModal('${d.id}')" style="padding: 6px 12px; font-size: 12px; font-weight: 600; background: #0284c7; border: none; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; margin-right: 4px;">
            📁 Planeaciones ${stats.totalSubidas > 0 ? `(${stats.totalSubidas})` : ''}
          </button>
          <button class="btn btn-success" onclick="openAdminUploadModal('${d.id}')" style="padding: 6px 10px; font-size: 12px; font-weight: 700; background: #10b981; color: #ffffff; border: none; border-radius: 8px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; margin-right: 4px;" title="Subir planeación didáctica para este docente">
            ➕ Subir
          </button>
          ${(!stats.hasTargetWeekDelivery && !isTargetInst) || (isTargetInst && stats.missingWeeks.length > 0) ? `
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
  const targetW = selectedAdminWeek || getActiveAcademicWeek();
  const isTargetInst = isWeekInstitutional(targetW);
  
  const docentesWithStats = adminDocentesData.map(d => {
    const stats = getDocenteComplianceStats(d.id, targetW);
    return { docente: d, stats };
  });

  const pendingRows = docentesWithStats.filter(item => {
    if (isTargetInst) return item.stats.missingWeeks.length > 0;
    return !item.stats.hasTargetWeekDelivery;
  });
  const okRows = docentesWithStats.filter(item => {
    if (isTargetInst) return item.stats.missingWeeks.length === 0;
    return item.stats.hasTargetWeekDelivery;
  });

  const currentW = getActiveAcademicWeek();
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
                  return `
                  <tr style="border-bottom:1px solid var(--border, #334155);">
                    <td style="padding:10px;">
                      <strong>${item.docente.nombre}</strong><br>
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
                  `;
                }).join('') : `<tr><td colspan="5" style="text-align:center; padding:20px; color:#10b981; font-weight:700;">🎉 ¡Excelente! No hay docentes pendientes en la Semana ${targetW}.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Broadcast Message Textarea -->
        <div style="background:var(--bg, #0f172a); border:1px solid var(--border, #334155); border-radius:12px; padding:14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <label style="font-size:12px; font-weight:700; color:var(--primary-accent);">📋 Plantilla de Comunicado Institucional para Copiar o Difusión:</label>
            <button type="button" class="btn btn-light btn-sm" onclick="copyTextareaContent('broadcastMsgTextarea')" style="padding:3px 10px; font-size:11px;">
              📋 Copiar Comunicado
            </button>
          </div>
          <textarea id="broadcastMsgTextarea" readonly style="width:100%; height:120px; background:transparent; border:none; color:inherit; font-family:inherit; font-size:12px; resize:none; outline:none;">${broadcastMsg}</textarea>
        </div>

      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

function copyTextareaContent(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(el.value).then(() => {
      showToast('✅ Copiado al portapapeles', 'success');
    }).catch(() => {
      el.select();
      document.execCommand('copy');
      showToast('✅ Copiado al portapapeles', 'success');
    });
  } else {
    el.select();
    document.execCommand('copy');
    showToast('✅ Copiado al portapapeles', 'success');
  }
}

function notifyDocenteReminder(docenteId) {
  const d = adminDocentesData.find(item => String(item.id) === String(docenteId));
  if (!d) return;

  const targetW = selectedAdminWeek || getActiveAcademicWeek();
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
        <textarea id="reminderMsgTextarea" readonly style="width:100%; height:130px; background:transparent; border:none; color:inherit; font-family:inherit; font-size:12.5px; resize:none; outline:none;">${msg}</textarea>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap;">
        <button type="button" class="btn btn-light" onclick="copyTextareaContent('reminderMsgTextarea')">
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
  const targetW = selectedAdminWeek || getActiveAcademicWeek();
  
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
  const doc = (adminDocentesData || []).find(d => String(d.id) === String(docenteId) || (d.linked_ids && d.linked_ids.map(String).includes(String(docenteId))));
  const targetIds = (doc && doc.linked_ids && doc.linked_ids.length > 0) ? doc.linked_ids.map(String) : [String(docenteId)];
  const plans = allPlaneaciones.filter(p => targetIds.includes(String(p.docente_id)));
  const docName = doc ? doc.nombre : (plans.length > 0 ? plans[0].docente_nombre : 'Docente');

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
                const currentWeek = getActiveAcademicWeek();
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
                        <td style="padding:10px;">${fmtDateOnly(p.fecha_aplicacion)}</td>
                        <td style="padding:10px; font-size:11px;">${fmtDate(p.fecha_subida)}</td>
                        <td style="padding:10px;">${badge(p.estado)}</td>
                        <td style="padding:10px; text-align:center; white-space:nowrap;">
                          ${pdfUrl ? `
                            ${(p.observaciones && p.observaciones.includes('[REVISION_IA_JSON]:')) ? `
  <button class="btn btn-primary" style="padding:4px 8px; font-size:11px; margin-right:4px; background:linear-gradient(135deg, #6366f1, #0284c7); font-weight:bold; color:#fff;" onclick="openSecuenciaViewerModal(${p.id})">✨ Ver Planeación</button>
` : `
  <button class="btn btn-primary" style="padding:4px 8px; font-size:11px; margin-right:4px; background:#0284c7;" onclick="openPdfViewerModal(${p.id})">📄 Ver PDF</button>
`}
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
    try {
      const colFormatter = new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
      let str = colFormatter.format(now);
      str = str.replace(/a\.\s*m\./i, 'AM').replace(/p\.\s*m\./i, 'PM');
      el.innerText = str + ' (Hora Col)';
    } catch (e) {
      el.innerText = now.toLocaleDateString('es-CO') + ' · ' + now.toLocaleTimeString('es-CO');
    }
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
  } else {
    statusBadge = `<span style="background:rgba(56,189,248,0.18); color:#0284c7; padding:2px 8px; border-radius:10px; font-weight:700; font-size:11px;">🔵 Semana Futura (Semana ${w})</span>`;
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
  const role = (user && user.rol ? user.rol : '').toLowerCase().trim();
  const isAdmin = !user?.docente_id && (role === 'administrador' || role === 'admin');
  if (isAdmin) {
    banner.style.display = 'none';
    return;
  }

  const currentW = getActiveAcademicWeek();

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
  return `https://fawxjdiwtamkctrhtqzc.supabase.co/storage/v1/object/public/planeaciones_pdfs/${plan.nombre_archivo}`;
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
  const plan = (allPlaneaciones || []).find(p => p.id === planId);
  if (plan && plan.observaciones && plan.observaciones.includes('[REVISION_IA_JSON]:')) {
    openSecuenciaViewerModal(planId);
    showToast('✨ Abriendo planeación estructurada para imprimir o exportar a PDF', 'info');
    return;
  }
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

  const currentWeek = getActiveAcademicWeek();
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
        <td style="padding: 8px 10px; white-space: nowrap;">${fmtDateOnly(p.fecha_aplicacion)}</td>
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
            ${(p.observaciones && p.observaciones.includes('[REVISION_IA_JSON]:')) ? `
  <button class="btn btn-primary" style="padding: 4px 8px; font-size: 11px; margin-right: 4px; background:linear-gradient(135deg, #6366f1, #0284c7); font-weight:bold; color:#fff;" onclick="openSecuenciaViewerModal(${p.id})">✨ Ver Planeación</button>
` : `
  <button class="btn btn-primary" style="padding: 4px 8px; font-size: 11px; margin-right: 4px; background:#0284c7;" onclick="openPdfViewerModal(${p.id})">📄 Ver PDF</button>
`}
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
        <div><strong>Fecha Aplicación:</strong><br>${fmtDateOnly(plan.fecha_aplicacion)}</div>
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
  const isDocente = user && (user.rol === 'docente' || Boolean(user.docente_id));
  let did = isDocente ? user.docente_id : parseInt(document.getElementById('docenteId')?.value);

  // Si el docente no tiene docente_id en la sesión activa, vincularlo automáticamente por su correo o nombre
  if (isDocente && (!did || isNaN(parseInt(did)))) {
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
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || (file.type && file.type.toLowerCase().includes('pdf'));
    if (!isPdf && !file.name.toLowerCase().endsWith('.pdf')) {
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
        area: areaVal,
        grado: gradoVal,
        fecha_aplicacion: fechaAppStr,
        numero_semana: autoSemana,
        observaciones: obsFinal,
        nombre_archivo: fileUrl
      });
    } else {
      // Fallback por FormData
      if (file && file.size > 4.2 * 1024 * 1024) {
        throw new Error('El archivo PDF pesa ' + (file.size / (1024 * 1024)).toFixed(1) + ' MB y superó el límite de transferencia. Por favor use un PDF comprimido a menos de 4 MB.');
      }
      const payload = new FormData();
      payload.append('docente_id', did);
      payload.append('area', areaVal);
      payload.append('grado', gradoVal);
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

  const currentW = getActiveAcademicWeek();
  const mondayCurrentStr = getMondayOfISOWeek(currentW);

  const docOptionsHtml = (docentesList || []).map(d => {
    const isSel = preselectedDocenteId && String(d.id) === String(preselectedDocenteId);
    return `<option value="${d.id}" ${isSel ? 'selected' : ''}>${d.nombre} (${d.sede_nombre || 'I.E. Guaimaral'})</option>`;
  }).join('');

  let weekOptionsHtml = '';
  for (let w = 52; w >= 1; w--) {
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
          <select id="adminModalDocenteId" required onchange="onAdminModalDocenteChange(this.value)" style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid var(--border, #334155); background:var(--bg, #0f172a); color:var(--text-main); font-size:13px;">
            <option value="">-- Seleccione un docente --</option>
            ${docOptionsHtml}
          </select>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
          <div>
            <label style="display:block; font-size:12.5px; font-weight:700; margin-bottom:4px; color:var(--text-main);">Área / Asignatura *</label>
            <select id="adminModalArea" required style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid var(--border, #334155); background:var(--bg, #0f172a); color:var(--text-main); font-size:13px;">
              <option value="">Seleccione área...</option>
              ${ALL_COLOMBIAN_AREAS.map(a => `<option value="${a}">${a}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="display:block; font-size:12.5px; font-weight:700; margin-bottom:4px; color:var(--text-main);">Grado Académico *</label>
            <select id="adminModalGrado" required style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid var(--border, #334155); background:var(--bg, #0f172a); color:var(--text-main); font-size:13px;">
              <option value="">Seleccione grado...</option>
              ${ALL_COLOMBIAN_GRADES.map(g => `<option value="${g}">${g}</option>`).join('')}
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
  if (preselectedDocenteId) {
    onAdminModalDocenteChange(preselectedDocenteId);
  }
}

function onAdminModalDocenteChange(docId) {
  const areaSel = document.getElementById('adminModalArea');
  const gradSel = document.getElementById('adminModalGrado');
  if (!areaSel || !gradSel) return;

  const doc = (docentesList || []).find(d => String(d.id) === String(docId));
  let assignedAreas = [];
  let assignedGrados = [];
  if (doc) {
    if (doc.areas) assignedAreas = doc.areas.split(',').map(s => s.trim()).filter(Boolean);
    if (doc.grados) assignedGrados = doc.grados.split(',').map(s => s.trim()).filter(Boolean);
  }

  // Update Area
  let areaHtml = '<option value="">Seleccione área...</option>';
  if (assignedAreas.length > 0) {
    areaHtml += `<optgroup label="⭐ Asignaturas Asignadas al Docente">`;
    assignedAreas.forEach(a => {
      areaHtml += `<option value="${a}">${a}</option>`;
    });
    areaHtml += `</optgroup>`;
    const otherAreas = ALL_COLOMBIAN_AREAS.filter(a => !assignedAreas.includes(a));
    if (otherAreas.length > 0) {
      areaHtml += `<optgroup label="Otras Áreas">`;
      otherAreas.forEach(a => {
        areaHtml += `<option value="${a}">${a}</option>`;
      });
      areaHtml += `</optgroup>`;
    }
  } else {
    ALL_COLOMBIAN_AREAS.forEach(a => {
      areaHtml += `<option value="${a}">${a}</option>`;
    });
  }
  areaSel.innerHTML = areaHtml;

  // Update Grado
  let gradoHtml = '<option value="">Seleccione grado...</option>';
  if (assignedGrados.length > 0) {
    gradoHtml += `<optgroup label="⭐ Grados Asignados al Docente">`;
    assignedGrados.forEach(g => {
      gradoHtml += `<option value="${g}">${g}</option>`;
    });
    gradoHtml += `</optgroup>`;
    const otherGrados = ALL_COLOMBIAN_GRADES.filter(g => !assignedGrados.includes(g));
    if (otherGrados.length > 0) {
      gradoHtml += `<optgroup label="Otros Grados">`;
      otherGrados.forEach(g => {
        gradoHtml += `<option value="${g}">${g}</option>`;
      });
      gradoHtml += `</optgroup>`;
    }
  } else {
    ALL_COLOMBIAN_GRADES.forEach(g => {
      gradoHtml += `<option value="${g}">${g}</option>`;
    });
  }
  gradSel.innerHTML = gradoHtml;
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

  if (file) {
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || (file.type && file.type.toLowerCase().includes('pdf'));
    if (!isPdf && !file.name.toLowerCase().endsWith('.pdf')) {
      showToast('⚠️ Únicamente se aceptan archivos en formato PDF (.pdf)', 'error');
      return;
    }
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
  const isAdmin = user && !user.docente_id && (user.rol === 'administrador' || user.rol === 'admin');

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
  const isAdmin = user && !user.docente_id && (user.rol === 'administrador' || user.rol === 'admin');
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

  // ✨ Si es una planeación generada por Rector IA, abrir directamente el Visor Institucional de Secuencia Didáctica
  if (plan.observaciones && plan.observaciones.includes('[REVISION_IA_JSON]:')) {
    openSecuenciaViewerModal(planId);
    return;
  }

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
              Docente: <strong>${plan.docente_nombre || 'Docente'}</strong> · Grado: ${plan.grado || '-'} · Aplicación: ${fmtDateOnly(plan.fecha_aplicacion)}
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





// ✨ Modal Visor Didáctico Institucional (100% LETRA NEGRA, ALTO CONTRASTE, FORMATO OFICIAL GUAIMARAL)
function openSecuenciaViewerModal(planId) {
  const plan = (allPlaneaciones || []).find(p => p.id === planId);
  if (!plan) {
    showToast("Planeación no encontrada", "error");
    return;
  }

  let secData = null;
  let metaData = {};

  if (plan.observaciones && plan.observaciones.includes("[REVISION_IA_JSON]:")) {
    try {
      const jsonStr = plan.observaciones.split("[REVISION_IA_JSON]:")[1];
      const parsed = JSON.parse(jsonStr);
      secData = parsed.secuencia || parsed;
      metaData = parsed;
    } catch (e) {
      console.error("Error parseando secuencia IA:", e);
    }
  }

  if (!secData) {
    openPdfViewerModal(planId);
    return;
  }

  const existing = document.getElementById("secuenciaViewerModal");
  if (existing) existing.remove();

  const acts = secData.actividades || [];
  const rubrica = secData.rubrica || [];
  const recursos = secData.recursos || [];
  const taller = secData.taller_imprimible || metaData.taller || null;
  const docName = plan.docente_nombre || 'Docente';
  const areaName = plan.area || metaData.area || '-';
  const gradoName = plan.grado || metaData.grado || '-';
  const temaName = secData.tema_principal || secData.titulo_secuencia || metaData.tema || plan.area || 'Planeación Didáctica';
  const fechaApp = fmtDateOnly(plan.fecha_aplicacion);
  const numSesiones = metaData.sesiones || acts.length || 1;

  const modal = document.createElement("div");
  modal.id = "secuenciaViewerModal";
  modal.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.92); backdrop-filter:blur(8px); z-index:999999; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:10px; animation: fadeIn 0.2s ease;";

  modal.innerHTML = `
    <div style="background:#0f172a; color:#ffffff; border-radius:16px; max-width:1180px; width:98%; height:96vh; display:flex; flex-direction:column; box-shadow:0 30px 70px rgba(0,0,0,0.8); border:1px solid #334155; overflow:hidden;">
      
      <!-- Topbar Header -->
      <div style="display:flex; justify-content:space-between; align-items:center; background:#020617; padding:12px 20px; border-bottom:1.5px solid #1e293b; flex-wrap:wrap; gap:10px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <img src="assets/img/logo_guaimaral.png" onerror="this.src='assets/img/escudo.png'" style="width:38px; height:38px; object-fit:contain;" alt="Logo" />
          <div>
            <h3 style="margin:0; font-size:15px; font-weight:800; color:#38bdf8; display:flex; align-items:center; gap:8px;">
              <span>${temaName}</span>
              <span style="font-size:10px; padding:2px 8px; background:linear-gradient(135deg, #6366f1, #a855f7); color:#fff; border-radius:12px; font-weight:700;">Rector 2.0 AI</span>
              <span style="font-size:10px; padding:2px 8px; background:rgba(56,189,248,0.15); color:#38bdf8; border-radius:12px; font-weight:600;">Semana ${plan.numero_semana || '-'}</span>
            </h3>
            <small style="color:#cbd5e1; font-size:12px;">
              Docente: <strong style="color:#ffffff;">${docName}</strong> • Área: <strong style="color:#ffffff;">${areaName}</strong> • Grado: <strong style="color:#ffffff;">${gradoName}</strong>
            </small>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <!-- Tabs de vista docente / estudiante -->
          <div style="background:#1e293b; padding:3px; border-radius:8px; display:inline-flex; gap:4px; border:1px solid #334155;">
            <button type="button" id="tabBtnDocente" onclick="switchSecuenciaTab('docente')" style="background:#0284c7; color:#fff; border:none; border-radius:6px; padding:6px 14px; font-size:11.5px; font-weight:800; cursor:pointer;">
              📖 Vista Docente
            </button>
            <button type="button" id="tabBtnEstudiante" onclick="switchSecuenciaTab('estudiante')" style="background:transparent; color:#94a3b8; border:none; border-radius:6px; padding:6px 14px; font-size:11.5px; font-weight:800; cursor:pointer;">
              🎓 Taller Estudiante
            </button>
          </div>

          <button type="button" onclick="printSecuenciaContent()" class="btn btn-primary btn-sm" style="padding:7px 16px; font-size:12px; display:inline-flex; align-items:center; gap:6px; background:#10b981; color:#fff; border:none; border-radius:8px; font-weight:800; cursor:pointer; box-shadow:0 2px 6px rgba(16,185,129,0.3);">
            🖨️ Imprimir / Guardar PDF
          </button>
          <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('secuenciaPrintContainer').innerText); showToast('Copiado al portapapeles', 'success');" class="btn btn-light btn-sm" style="padding:7px 12px; font-size:12px; background:rgba(255,255,255,0.12); border:1px solid #475569; border-radius:8px; color:#ffffff; font-weight:700; cursor:pointer;">
            📋 Copiar Todo
          </button>
          <button type="button" onclick="document.getElementById('secuenciaViewerModal').remove()" style="background:none; border:none; font-size:26px; cursor:pointer; color:#cbd5e1; line-height:1; padding:0 6px;" title="Cerrar">&times;</button>
        </div>
      </div>

      <!-- Document Content Body: 100% LETRA NEGRA, CONTRASTE TOTAL -->
      <div id="secuenciaContentContainer" style="flex:1; width:100%; height:100%; overflow-y:auto; padding:20px; background:#cbd5e1; font-family:'Segoe UI', system-ui, -apple-system, sans-serif;">
        <div id="secuenciaPrintContainer" style="background:#ffffff; color:#000000; max-width:860px; margin:0 auto; padding:32px 38px; border-radius:6px; box-shadow:0 10px 35px rgba(0,0,0,0.2); border:1.5px solid #475569;">
          
          <!-- SECCIÓN DOCENTE (PLANEACIÓN) -->
          <div id="secDocenteSection">
            <!-- 1. ENCABEZADO INSTITUCIONAL -->
            <div style="display:flex; gap:16px; align-items:center; margin-bottom:14px; border-bottom:2.5px solid #000000; padding-bottom:10px;">
              <div style="width:75px; height:75px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                <img src="assets/img/logo_guaimaral.png" onerror="this.src='assets/img/escudo.png'" style="max-width:75px; max-height:75px; object-fit:contain;" alt="Logo I.E. Guaimaral" />
              </div>
              <div style="flex-grow:1; text-align:center;">
                <h1 style="font-size:21px; font-weight:900; text-transform:uppercase; letter-spacing:-0.3px; color:#000000; margin:0;">
                  INSTITUCIÓN EDUCATIVA GUAIMARAL
                </h1>
                <div style="margin-top:6px; padding:4px 0; border-top:1.5px solid #000000; border-bottom:1.5px solid #000000;">
                  <h2 style="font-size:12px; font-weight:900; text-transform:uppercase; color:#000000; margin:0;">
                    PROCESO: GESTIÓN ACADÉMICA - PREPARACIÓN DE CLASES
                  </h2>
                </div>
                <p style="font-size:10.5px; color:#1f2937; margin:4px 0 0; font-weight:800; font-style:italic;">
                  "Calidad Humana y Excelencia Académica"
                </p>
              </div>
            </div>

            <!-- 2. TABLA PRINCIPAL DE DATOS: BORDES Y LETRAS NEGRAS NÍTIDAS -->
            <div style="border:2px solid #000000; margin-bottom:12px; font-size:12px; color:#000000;">
              <!-- Fila 1: Título -->
              <div style="display:flex;">
                <div style="width:30%; padding:8px 10px; font-weight:900; background:#f1f5f9; border-right:1.5px solid #000000; display:flex; align-items:center; color:#000000;">
                  TÍTULO DE LA SECUENCIA DIDÁCTICA:
                </div>
                <div style="width:70%; padding:8px 10px; font-weight:900; font-size:13px; color:#000000;">
                  ${secData.titulo_secuencia || secData.tema_principal || temaName}
                </div>
              </div>
              <!-- Fila 2: Área y No. -->
              <div style="display:flex; border-top:1.5px solid #000000;">
                <div style="width:65%; display:flex; border-right:1.5px solid #000000;">
                  <div style="width:38%; padding:8px 10px; font-weight:900; background:#f1f5f9; border-right:1.5px solid #000000; color:#000000;">
                    ÁREA DE CONOCIMIENTO:
                  </div>
                  <div style="width:62%; padding:8px 10px; font-weight:800; color:#000000;">
                    ${areaName}
                  </div>
                </div>
                <div style="width:35%; display:flex;">
                  <div style="width:60%; padding:8px 10px; font-weight:900; background:#f1f5f9; border-right:1.5px solid #000000; text-align:center; color:#000000;">
                    SECUENCIA Nº:
                  </div>
                  <div style="width:40%; padding:8px 10px; font-weight:900; text-align:center; color:#000000;">
                    ${secData.numero_secuencia || '1'}
                  </div>
                </div>
              </div>
              <!-- Fila 3: Tema y Docente -->
              <div style="display:flex; border-top:1.5px solid #000000;">
                <div style="width:20%; padding:8px 10px; font-weight:900; background:#f1f5f9; border-right:1.5px solid #000000; color:#000000;">
                  TEMA:
                </div>
                <div style="width:45%; padding:8px 10px; font-weight:700; border-right:1.5px solid #000000; color:#000000;">
                  ${temaName}
                </div>
                <div style="width:15%; padding:8px 10px; font-weight:900; background:#f1f5f9; border-right:1.5px solid #000000; color:#000000;">
                  DOCENTE:
                </div>
                <div style="width:20%; padding:8px 10px; font-weight:800; color:#000000;">
                  ${docName}
                </div>
              </div>
              <!-- Fila 4: Fecha, Grado, Tiempo -->
              <div style="display:flex; border-top:1.5px solid #000000;">
                <div style="width:33.33%; display:flex; border-right:1.5px solid #000000;">
                  <div style="width:38%; padding:8px 10px; font-weight:900; background:#f1f5f9; border-right:1.5px solid #000000; color:#000000;">
                    FECHA:
                  </div>
                  <div style="width:62%; padding:8px 10px; font-weight:700; color:#000000;">
                    ${fechaApp}
                  </div>
                </div>
                <div style="width:33.33%; display:flex; border-right:1.5px solid #000000;">
                  <div style="width:38%; padding:8px 10px; font-weight:900; background:#f1f5f9; border-right:1.5px solid #000000; color:#000000;">
                    GRADO:
                  </div>
                  <div style="width:62%; padding:8px 10px; font-weight:900; text-align:center; color:#000000;">
                    ${gradoName}
                  </div>
                </div>
                <div style="width:33.34%; display:flex;">
                  <div style="width:38%; padding:8px 10px; font-weight:900; background:#f1f5f9; border-right:1.5px solid #000000; color:#000000;">
                    TIEMPO:
                  </div>
                  <div style="width:62%; padding:8px 10px; font-weight:700; color:#000000;">
                    ${numSesiones} Sesiones
                  </div>
                </div>
              </div>
            </div>

            <!-- 3. SECCIONES DEL FORMATO: ENCABEZADOS VERDES #EDF7ED CON LETRA NEGRA -->
            <div style="display:flex; flex-direction:column; gap:8px; font-size:12px; color:#000000;">
              <!-- Descripción -->
              <div style="border:1.5px solid #000000;">
                <div style="background:#EDF7ED; border-bottom:1.5px solid #000000; padding:6px 10px; font-weight:900; font-size:11px; text-transform:uppercase; text-align:center; color:#000000;">
                  DESCRIPCIÓN DE LA SECUENCIA DIDÁCTICA: APRENDIZAJES A LOGRAR
                </div>
                <div style="padding:10px 12px; line-height:1.5; text-align:justify; color:#000000; font-weight:500;">
                  ${secData.descripcion_secuencia || secData.objetivo_aprendizaje || 'Secuencia didáctica orientada al fortalecimiento conceptual, práctico y formativo de los estudiantes.'}
                </div>
              </div>

              <!-- Objetivo de Aprendizaje -->
              <div style="border:1.5px solid #000000;">
                <div style="background:#EDF7ED; border-bottom:1.5px solid #000000; padding:6px 10px; font-weight:900; font-size:11px; text-transform:uppercase; text-align:center; color:#000000;">
                  OBJETIVO DE APRENDIZAJE
                </div>
                <div style="padding:10px 12px; line-height:1.5; font-weight:700; color:#000000;">
                  ${secData.objetivo_aprendizaje || 'Comprender y aplicar los conceptos fundamentales del tema propuesto.'}
                </div>
              </div>

              <!-- Competencias MEN y Estándar -->
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                <div style="border:1.5px solid #000000;">
                  <div style="background:#EDF7ED; border-bottom:1.5px solid #000000; padding:6px 10px; font-weight:900; font-size:11px; text-transform:uppercase; text-align:center; color:#000000;">
                    COMPETENCIAS DEL MEN
                  </div>
                  <div style="padding:10px 12px; line-height:1.5; color:#000000; font-weight:500;">
                    ${secData.competencias_men || 'Desarrollo de competencias básicas y ciudadanas del Ministerio de Educación Nacional.'}
                  </div>
                </div>
                <div style="border:1.5px solid #000000;">
                  <div style="background:#EDF7ED; border-bottom:1.5px solid #000000; padding:6px 10px; font-weight:900; font-size:11px; text-transform:uppercase; text-align:center; color:#000000;">
                    ESTÁNDAR DE COMPETENCIA DEL MEN
                  </div>
                  <div style="padding:10px 12px; line-height:1.5; color:#000000; font-weight:500;">
                    ${secData.estandar || 'Estándar articulado a los lineamientos curriculares oficiales.'}
                  </div>
                </div>
              </div>

              <!-- DBA -->
              <div style="border:1.5px solid #000000;">
                <div style="background:#EDF7ED; border-bottom:1.5px solid #000000; padding:6px 10px; font-weight:900; font-size:11px; text-transform:uppercase; text-align:center; color:#000000;">
                  DERECHOS BÁSICOS DE APRENDIZAJE (DBA) / ORIENTACIONES PEDAGÓGICAS
                </div>
                <div style="padding:10px 12px; line-height:1.5; font-weight:700; color:#000000;">
                  ${secData.dba_utilizado || 'Articulación pedagógica integral según la malla curricular del grado.'}
                </div>
              </div>

              <!-- CRESE y Corporiedad -->
              <div style="border:1.5px solid #000000; padding:8px 12px; background:#f8fafc; color:#000000; font-size:12px;">
                <strong>EJE TRANSVERSAL (CRESE):</strong> <span style="font-weight:700;">${secData.eje_crese_utilizado || 'Educación Socioemocional y Ciudadana'}</span>
                <span style="margin: 0 10px; color:#000000; font-weight:900;">|</span>
                <strong>CORPORIEDAD / ADI:</strong> <span style="font-weight:700;">${secData.corporiedad_adi || 'Integración pedagógica activa'}</span>
              </div>

              <!-- Metodología -->
              <div style="border:1.5px solid #000000;">
                <div style="background:#EDF7ED; border-bottom:1.5px solid #000000; padding:6px 10px; font-weight:900; font-size:11px; text-transform:uppercase; text-align:center; color:#000000;">
                  METODOLOGÍA
                </div>
                <div style="padding:10px 12px; line-height:1.5; color:#000000; font-weight:500;">
                  ${secData.metodologia || 'Aprendizaje Basado en Indagación, trabajo colaborativo, modelado conceptual y evaluación formativa continua.'}
                </div>
              </div>

              <!-- Recursos -->
              <div style="border:1.5px solid #000000;">
                <div style="display:grid; grid-template-columns: 1fr 1fr; background:#EDF7ED; border-bottom:1.5px solid #000000; font-weight:900; font-size:11px; text-transform:uppercase; color:#000000; text-align:center;">
                  <div style="padding:6px 10px; border-right:1.5px solid #000000;">NOMBRE DEL RECURSO</div>
                  <div style="padding:6px 10px;">DESCRIPCIÓN DEL RECURSO</div>
                </div>
                ${recursos.length > 0 ? recursos.map(r => `
                  <div style="display:grid; grid-template-columns: 1fr 1fr; border-bottom:1px solid #000000; font-size:11.5px; color:#000000;">
                    <div style="padding:8px 10px; border-right:1.5px solid #000000; font-weight:800; color:#000000;">${r.nombre || 'Recurso Pedagógico'}</div>
                    <div style="padding:8px 10px; color:#000000; font-weight:500;">${r.descripcion || '-'}</div>
                  </div>
                `).join('') : `
                  <div style="padding:10px 12px; font-style:italic; color:#000000;">Material escolar, guías didácticas, pizarra y recursos audiovisuales institucionales.</div>
                `}
              </div>

              <!-- 4. DESARROLLO DE LA SECUENCIA DIDÁCTICA POR SESIONES -->
              <div style="border:2px solid #000000; margin-top:8px;">
                <div style="background:#000000; color:#ffffff; padding:8px 14px; font-weight:900; font-size:12px; text-transform:uppercase; display:flex; justify-content:space-between; align-items:center;">
                  <span>DESARROLLO DE LA SECUENCIA DIDÁCTICA (${acts.length} Sesiones)</span>
                  <span style="font-size:10.5px; font-weight:700; color:#ffffff;">Momento 1: Inicio • Momento 2: Desarrollo • Momento 3: Cierre</span>
                </div>
                
                ${acts.map((act, idx) => `
                  <div style="border-bottom:${idx < acts.length - 1 ? '2px solid #000000' : 'none'}; padding:12px 14px; background:${idx % 2 === 0 ? '#ffffff' : '#fcfcfc'}; color:#000000;">
                    <div style="display:flex; justify-content:space-between; font-weight:900; font-size:13px; margin-bottom:8px; color:#000000; border-bottom:1px solid #e2e8f0; padding-bottom:4px;">
                      <span>📚 Sesión ${act.sesion || idx + 1}: ${temaName}</span>
                      <span style="font-size:11px; background:#000000; color:#ffffff; padding:2px 8px; border-radius:4px; font-weight:800;">⏱️ ${act.tiempo || '2 Horas'}</span>
                    </div>
                    
                    <div style="display:flex; flex-direction:column; gap:8px; font-size:12px; color:#000000;">
                      <div style="background:#f0fdf4; border-left:4.5px solid #16a34a; padding:8px 12px; border-radius:4px; border:1px solid #bbf7d0; border-left-width:4.5px;">
                        <strong style="color:#14532d; font-size:12px;">🌱 Momento 1 - Inicio / Exploración:</strong>
                        <p style="margin:4px 0 0; line-height:1.45; color:#000000; font-weight:600;">${act.fase_inicio || act.descripcion || 'Activación de saberes previos y motivación inicial.'}</p>
                      </div>
                      <div style="background:#eff6ff; border-left:4.5px solid #2563eb; padding:8px 12px; border-radius:4px; border:1px solid #bfdbfe; border-left-width:4.5px;">
                        <strong style="color:#1e3a8a; font-size:12px;">⚙️ Momento 2 - Desarrollo / Estructuración:</strong>
                        <p style="margin:4px 0 0; line-height:1.45; color:#000000; font-weight:600;">${act.fase_desarrollo || 'Conceptualización guiada y actividades prácticas en clase.'}</p>
                      </div>
                      <div style="background:#fdf4ff; border-left:4.5px solid #c026d3; padding:8px 12px; border-radius:4px; border:1px solid #f5d0fe; border-left-width:4.5px;">
                        <strong style="color:#701a75; font-size:12px;">🎯 Momento 3 - Cierre / Transferencia:</strong>
                        <p style="margin:4px 0 0; line-height:1.45; color:#000000; font-weight:600;">${act.fase_cierre || 'Síntesis, autoevaluación y comprobación de aprendizajes.'}</p>
                      </div>

                      ${(act.preguntas_socraticas && act.preguntas_socraticas.length > 0) ? `
                        <div style="background:#fffbeb; border:1.5px dashed #d97706; padding:8px 12px; border-radius:4px; font-size:11.5px; color:#000000;">
                          <strong style="color:#78350f;">💬 Preguntas Socráticas para el Docente:</strong>
                          <ul style="margin:4px 0 0 18px; padding:0; color:#000000; font-weight:600;">
                            ${act.preguntas_socraticas.map(p => `<li style="margin-bottom:2px;">${p}</li>`).join('')}
                          </ul>
                        </div>
                      ` : ''}
                    </div>
                  </div>
                `).join('')}
              </div>

              <!-- 5. ADECUACIONES PIAR / DUA -->
              <div style="border:1.5px solid #000000; margin-top:8px;">
                <div style="background:#EDF7ED; border-bottom:1.5px solid #000000; padding:6px 10px; font-weight:900; font-size:11px; text-transform:uppercase; text-align:center; color:#000000;">
                  ADECUACIONES CURRICULARES (DUA / PIAR - INCLUSIÓN EDUCATIVA)
                </div>
                <div style="padding:10px 12px; line-height:1.5; white-space:pre-line; color:#000000; font-weight:600;">
                  ${secData.adecuaciones_piar || "1. Apoyos Visuales y Gráficos: Esquemas conceptuales y guías paso a paso.\n2. Flexibilización de Tiempos: Tiempo adaptado para lectura y procesamiento.\n3. Trabajo por Pares y Tutoría: Acompañamiento guiado en mesa de trabajo según el Plan Individual de Ajustes Razonables (PIAR)."}
                </div>
              </div>

              <!-- 6. RÚBRICA DE EVALUACIÓN INSTITUCIONAL -->
              ${(rubrica && rubrica.length > 0) ? `
                <div style="border:2px solid #000000; margin-top:8px;">
                  <div style="background:#000000; color:#ffffff; padding:7px 12px; font-weight:900; font-size:11.5px; text-transform:uppercase; text-align:center;">
                    RÚBRICA DE EVALUACIÓN FORMATIVA
                  </div>
                  <table style="width:100%; border-collapse:collapse; font-size:11px; text-align:left; color:#000000;">
                    <thead>
                      <tr style="background:#f1f5f9; border-bottom:2px solid #000000;">
                        <th style="padding:7px; border-right:1.5px solid #000000; width:25%; color:#000000; font-weight:900;">Criterio</th>
                        <th style="padding:7px; border-right:1.5px solid #000000; width:18%; color:#000000; font-weight:900;">Bajo</th>
                        <th style="padding:7px; border-right:1.5px solid #000000; width:19%; color:#000000; font-weight:900;">Básico</th>
                        <th style="padding:7px; border-right:1.5px solid #000000; width:19%; color:#000000; font-weight:900;">Alto</th>
                        <th style="padding:7px; width:19%; color:#000000; font-weight:900;">Superior</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${rubrica.map(r => `
                        <tr style="border-bottom:1px solid #000000;">
                          <td style="padding:7px; font-weight:800; border-right:1.5px solid #000000; background:#f8fafc; color:#000000;">${r.criterio || '-'}</td>
                          <td style="padding:7px; border-right:1.5px solid #000000; color:#000000; font-weight:500;">${r.bajo || '-'}</td>
                          <td style="padding:7px; border-right:1.5px solid #000000; color:#000000; font-weight:500;">${r.basico || '-'}</td>
                          <td style="padding:7px; border-right:1.5px solid #000000; color:#000000; font-weight:600;">${r.alto || '-'}</td>
                          <td style="padding:7px; color:#000000; font-weight:700;">${r.superior || '-'}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- SECCIÓN ESTUDIANTE (TALLER IMPRIMIBLE EN LETRA NEGRA) -->
          <div id="secEstudianteSection" style="display:none; border-top:2.5px dashed #000000; padding-top:18px; color:#000000;">
            <!-- Encabezado Taller -->
            <div style="display:flex; gap:14px; align-items:center; margin-bottom:14px; border-bottom:2px solid #000000; padding-bottom:10px;">
              <img src="assets/img/logo_guaimaral.png" onerror="this.src='assets/img/escudo.png'" style="width:70px; height:70px; object-fit:contain;" alt="Logo" />
              <div style="flex-grow:1; text-align:center;">
                <h2 style="font-size:19px; font-weight:900; margin:0; text-transform:uppercase; color:#000000;">INSTITUCIÓN EDUCATIVA GUAIMARAL</h2>
                <h3 style="font-size:13px; font-weight:900; margin:4px 0 0; color:#000000;">TALLER DE APLICACIÓN Y PROFUNDIZACIÓN</h3>
                <p style="font-size:11px; color:#000000; margin:3px 0 0; font-weight:700;">Área: ${areaName} • Grado: ${gradoName} • Docente: ${docName}</p>
              </div>
            </div>

            <!-- Ficha Estudiante -->
            <div style="border:1.5px solid #000000; padding:10px 14px; margin-bottom:14px; background:#f8fafc; font-size:12px; color:#000000; display:grid; grid-template-columns: 2fr 1fr; gap:10px;">
              <div><strong>Estudiante:</strong> __________________________________________________</div>
              <div><strong>Fecha:</strong> _________________</div>
            </div>

            ${taller ? `
              <div style="display:flex; flex-direction:column; gap:14px; font-size:12.5px; color:#000000;">
                ${taller.instrucciones ? `
                  <div style="background:#f8fafc; border-left:4.5px solid #000000; border:1.5px solid #000000; border-left-width:4.5px; padding:10px 14px; border-radius:4px;">
                    <strong style="color:#000000; font-size:12px;">📋 Instrucciones Generales:</strong>
                    <p style="margin:4px 0 0; color:#000000; font-weight:600; line-height:1.45;">${taller.instrucciones}</p>
                  </div>
                ` : ''}

                ${(taller.ejercicios && taller.ejercicios.length > 0) ? `
                  <div>
                    <h4 style="font-size:13.5px; font-weight:900; color:#000000; margin:0 0 10px;">✏️ Actividades y Ejercicios Prácticos:</h4>
                    <div style="display:flex; flex-direction:column; gap:10px;">
                      ${taller.ejercicios.map((ej, idx) => `
                        <div style="border:1.5px solid #000000; border-radius:6px; padding:12px 14px; background:#fff; color:#000000;">
                          <strong style="font-size:13px;">${idx + 1}.</strong> ${typeof ej === 'string' ? ej : (ej.enunciado || JSON.stringify(ej))}
                          <div style="margin-top:25px; border-bottom:1px dashed #000000;"></div>
                        </div>
                      `).join('')}
                    </div>
                  </div>
                ` : ''}

                ${taller.reto_creativo ? `
                  <div style="background:#fffbeb; border:1.5px solid #000000; padding:12px 14px; border-radius:6px; color:#000000;">
                    <strong style="color:#000000; font-size:12px;">🌟 Reto Creativo / Desafío:</strong>
                    <p style="margin:4px 0 0; color:#000000; font-weight:600; line-height:1.45;">${taller.reto_creativo}</p>
                  </div>
                ` : ''}
              </div>
            ` : `
              <div style="text-align:center; padding:35px; color:#000000; font-weight:600; font-style:italic;">
                No se adjuntó taller fotocopiable independiente para esta planeación.
              </div>
            `}
          </div>

        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

// Función para alternar pestañas entre Docente y Estudiante
function switchSecuenciaTab(tab) {
  const docSec = document.getElementById('secDocenteSection');
  const estSec = document.getElementById('secEstudianteSection');
  const btnDoc = document.getElementById('tabBtnDocente');
  const btnEst = document.getElementById('tabBtnEstudiante');

  if (!docSec || !estSec) return;

  if (tab === 'estudiante') {
    docSec.style.display = 'none';
    estSec.style.display = 'block';
    if (btnDoc) { btnDoc.style.background = 'transparent'; btnDoc.style.color = '#94a3b8'; }
    if (btnEst) { btnEst.style.background = '#0284c7'; btnEst.style.color = '#fff'; }
  } else {
    docSec.style.display = 'block';
    estSec.style.display = 'none';
    if (btnDoc) { btnDoc.style.background = '#0284c7'; btnDoc.style.color = '#fff'; }
    if (btnEst) { btnEst.style.background = 'transparent'; btnEst.style.color = '#94a3b8'; }
  }
}

// Función de impresión limpia y directa idéntica al original
function printSecuenciaContent() {
  const container = document.getElementById('secuenciaPrintContainer');
  if (!container) return;

  const printWin = window.open('', '_blank', 'width=950,height=850');
  if (!printWin) {
    window.print();
    return;
  }

  printWin.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Planeación Didáctica - Institución Educativa Guaimaral</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #000000; margin: 0; padding: 15px; background: #fff; }
    @media print {
      body { padding: 0; margin: 0; color: #000000; }
      @page { margin: 10mm; size: letter portrait; }
    }
  </style>
</head>
<body>
  ${container.innerHTML}
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 400);
    };
  </script>
</body>
</html>`);
  printWin.document.close();
}

// ══════════════════════════════════════════════════════════════════════════════
// 🔍 CENTRO MAESTRO DE DIAGNÓSTICO, ERRORES Y SOLUCIÓN DE DOCENTES (ADMIN)
// ══════════════════════════════════════════════════════════════════════════════

let diagnosticoGlobalData = null;
let currentDiagnosticoFilter = 'all'; // 'all', 'issues', 'ok'
let currentDiagnosticoTab = 'docentes'; // 'docentes', 'logs', 'storage'

async function openDiagnosticoModal(selectedWeek = null) {
  const user = Storage.getUser();
  const role = (user && user.rol ? user.rol : '').toLowerCase().trim();
  const isAdmin = !user?.docente_id && (role === 'administrador' || role === 'admin' || role === 'coordinador');
  if (!isAdmin) {
    showToast('⚠️ Acceso exclusivo para el administrador o coordinador.', 'error');
    return;
  }

  const existing = document.getElementById('adminDiagnosticoModal');
  if (existing) existing.remove();

  const targetW = selectedWeek || selectedAdminWeek || getActiveAcademicWeek();

  const modal = document.createElement('div');
  modal.id = 'adminDiagnosticoModal';
  modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(15,23,42,0.85); backdrop-filter:blur(8px); z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:16px; animation:fadeIn 0.2s ease;';

  modal.innerHTML = `
    <div style="background:var(--surface, #1e293b); color:var(--text-main, #f1f5f9); border-radius:18px; max-width:1250px; width:98%; height:94vh; display:flex; flex-direction:column; box-shadow:0 30px 80px rgba(0,0,0,0.7); border:1.5px solid var(--border, #334155); overflow:hidden;">
      
      <!-- Topbar Header -->
      <div style="background:var(--bg, #0f172a); padding:16px 24px; border-bottom:1.5px solid var(--border, #334155); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div style="display:flex; align-items:center; gap:14px;">
          <div style="width:44px; height:44px; border-radius:12px; background:linear-gradient(135deg, #f59e0b, #d97706); display:flex; align-items:center; justify-content:center; font-size:22px; color:#fff; box-shadow:0 4px 12px rgba(245,158,11,0.3);">
            🔍
          </div>
          <div>
            <h3 style="margin:0; font-size:17.5px; font-weight:800; color:#f59e0b; display:flex; align-items:center; gap:8px;">
              Centro de Diagnóstico, Errores y Solución por Docente
              <span style="font-size:11px; padding:2px 8px; background:rgba(245,158,11,0.2); border:1px solid #f59e0b; border-radius:10px; color:#f59e0b; font-weight:700;">ADMIN PRO</span>
            </h3>
            <small style="color:var(--text-muted, #94a3b8); font-size:12px;">
              Auditoría en tiempo real de por qué fallan subidas, estado de la base de datos y herramientas de solución inmediata.
            </small>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:6px; background:var(--surface); padding:4px 10px; border-radius:10px; border:1px solid var(--border);">
            <label style="font-size:12px; font-weight:700; color:var(--text-muted);">Auditar Semana:</label>
            <select id="selDiagnosticoWeek" onchange="openDiagnosticoModal(this.value)" style="background:transparent; border:none; color:var(--text-main); font-weight:800; font-size:13px; cursor:pointer; outline:none;"></select>
          </div>
          <button type="button" onclick="loadDiagnosticoData(${targetW})" class="btn btn-light btn-sm" style="padding:6px 12px; font-size:12px; border-radius:8px; font-weight:700; display:inline-flex; align-items:center; gap:4px;" title="Recargar datos">
            🔄 Refrescar
          </button>
          <button type="button" onclick="document.getElementById('adminDiagnosticoModal').remove()" style="background:none; border:none; font-size:28px; cursor:pointer; color:var(--text-muted); line-height:1; padding:0 6px;" title="Cerrar">&times;</button>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(0,0,0,0.15); padding:10px 24px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:10px;">
        <div style="display:flex; gap:8px;">
          <button type="button" id="tabDiagDocentesBtn" onclick="switchDiagnosticoTab('docentes')" class="btn btn-sm btn-primary" style="padding:6px 14px; font-size:12px; font-weight:700; border-radius:8px;">
            👨‍🏫 Diagnóstico de Docentes (<span id="diagDocentesCount">0</span>)
          </button>
          <button type="button" id="tabDiagLogsBtn" onclick="switchDiagnosticoTab('logs')" class="btn btn-sm btn-light" style="padding:6px 14px; font-size:12px; font-weight:700; border-radius:8px;">
            📜 Logs de la Base de Datos (Últimas Subidas)
          </button>
          <button type="button" id="tabDiagStorageBtn" onclick="switchDiagnosticoTab('storage')" class="btn btn-sm btn-light" style="padding:6px 14px; font-size:12px; font-weight:700; border-radius:8px;">
            📦 Almacenamiento & Semanas Institucionales
          </button>
        </div>

        <div style="display:flex; align-items:center; gap:8px;">
          <button type="button" onclick="copyDiagnosticoSummary()" class="btn btn-light btn-sm" style="padding:6px 12px; font-size:11.5px; border-radius:8px; font-weight:700; background:rgba(56,189,248,0.15); color:var(--primary-accent); border:1px solid rgba(56,189,248,0.3);">
            📋 Copiar Informe de Diagnóstico
          </button>
        </div>
      </div>

      <!-- Body Content (Scrollable) -->
      <div id="diagnosticoModalBody" style="flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:16px;">
        <div style="text-align:center; padding:50px; color:var(--text-muted);">
          <span style="font-size:32px; display:block; margin-bottom:8px; animation:spin 1s infinite linear;">⏳</span>
          Analizando base de datos, nómina docente, registros y cuotas de almacenamiento...
        </div>
      </div>

    </div>
  `;

  document.body.appendChild(modal);

  // Poblar selector de semanas
  const selWeek = document.getElementById('selDiagnosticoWeek');
  if (selWeek) {
    const curW = getActiveAcademicWeek();
    let opt = '';
    for (let w = curW + 2; w >= EVALUACION_INICIO_SEMANA; w--) {
      const isCur = (w === curW);
      opt += `<option value="${w}" ${w === targetW ? 'selected' : ''}>Semana ${w} ${isCur ? '• ACTUAL' : ''}</option>`;
    }
    selWeek.innerHTML = opt;
  }

  await loadDiagnosticoData(targetW);
}

async function loadDiagnosticoData(targetWeek) {
  const container = document.getElementById('diagnosticoModalBody');
  if (!container) return;

  try {
    const data = await API.Planeaciones.getDiagnostico(targetWeek);
    diagnosticoGlobalData = data;

    const countBadge = document.getElementById('diagDocentesCount');
    if (countBadge) countBadge.innerText = (data.docentes || []).length;

    renderCurrentDiagnosticoView();
  } catch (err) {
    console.error('Error cargando diagnóstico:', err);
    container.innerHTML = `
      <div style="background:rgba(239,68,68,0.15); border:1.5px solid #ef4444; border-radius:12px; padding:24px; text-align:center; color:#ef4444;">
        <h4 style="margin:0 0 8px; font-size:16px;">💥 Error al cargar diagnóstico de docentes</h4>
        <p style="margin:0; font-size:13px; color:var(--text-main);">${err.message || 'No se pudo conectar con el endpoint de diagnóstico'}</p>
        <button type="button" onclick="loadDiagnosticoData(${targetWeek})" class="btn btn-danger btn-sm" style="margin-top:14px; font-weight:700;">Reintentar</button>
      </div>
    `;
  }
}

function switchDiagnosticoTab(tab) {
  currentDiagnosticoTab = tab;

  const btnDoc = document.getElementById('tabDiagDocentesBtn');
  const btnLogs = document.getElementById('tabDiagLogsBtn');
  const btnSto = document.getElementById('tabDiagStorageBtn');

  if (btnDoc) {
    btnDoc.className = tab === 'docentes' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-light';
  }
  if (btnLogs) {
    btnLogs.className = tab === 'logs' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-light';
  }
  if (btnSto) {
    btnSto.className = tab === 'storage' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-light';
  }

  renderCurrentDiagnosticoView();
}

function renderCurrentDiagnosticoView() {
  const container = document.getElementById('diagnosticoModalBody');
  if (!container || !diagnosticoGlobalData) return;

  if (currentDiagnosticoTab === 'docentes') {
    renderDiagnosticoDocentesTab(container, diagnosticoGlobalData);
  } else if (currentDiagnosticoTab === 'logs') {
    renderDiagnosticoLogsTab(container, diagnosticoGlobalData);
  } else if (currentDiagnosticoTab === 'storage') {
    renderDiagnosticoStorageTab(container, diagnosticoGlobalData);
  }
}

// ── PESTAÑA 1: DIAGNÓSTICO POR DOCENTE ────────────────────────────────────
function renderDiagnosticoDocentesTab(container, data) {
  const t = data.totales || {};
  const s = data.storage || {};
  const isInst = data.es_institucional;
  const docs = data.docentes || [];

  // Filtrado según búsqueda y estado
  const searchInput = document.getElementById('searchDiagDocente');
  const query = searchInput ? (searchInput.value || '').toLowerCase().trim() : '';

  const filteredDocs = docs.filter(d => {
    // Filtro texto
    if (query) {
      const matchText = (d.nombre || '').toLowerCase().includes(query) ||
                        (d.correo || '').toLowerCase().includes(query) ||
                        (d.sede_nombre || '').toLowerCase().includes(query);
      if (!matchText) return false;
    }
    // Filtro categoría
    if (currentDiagnosticoFilter === 'issues') {
      return d.severidad !== 'ok' || d.estado_semana === 'sin_entrega' || d.estado_semana === 'no_entrego_cron';
    }
    if (currentDiagnosticoFilter === 'ok') {
      return d.severidad === 'ok' && (d.estado_semana === 'a_tiempo' || d.estado_semana === 'entregado' || d.estado_semana === 'subio_opcional');
    }
    return true;
  });

  container.innerHTML = `
    <!-- KPI Summary Grid -->
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
      
      <div style="background:var(--bg); border:1px solid var(--border); border-radius:12px; padding:12px 16px;">
        <small style="color:var(--text-muted); font-size:11.5px; font-weight:700;">👨‍🏫 Total Docentes Activos</small>
        <div style="font-size:22px; font-weight:800; color:var(--text-main); margin-top:2px;">${t.docentes_activos || 0}</div>
      </div>

      <div style="background:var(--bg); border:1px solid rgba(16,185,129,0.3); border-radius:12px; padding:12px 16px;">
        <small style="color:#10b981; font-size:11.5px; font-weight:700;">🟢 Entregaron / Al Día (Sem ${data.semana_consultada})</small>
        <div style="font-size:22px; font-weight:800; color:#10b981; margin-top:2px;">
          ${t.al_dia || 0} <span style="font-size:13px; font-weight:600; color:var(--text-muted);">(${Math.round(((t.al_dia || 0)/(t.docentes_activos || 1))*100)}%)</span>
        </div>
      </div>

      <div style="background:var(--bg); border:1px solid rgba(239,68,68,0.3); border-radius:12px; padding:12px 16px;">
        <small style="color:#ef4444; font-size:11.5px; font-weight:700;">🔴 Con Fallos o Sin Entrega (Sem ${data.semana_consultada})</small>
        <div style="font-size:22px; font-weight:800; color:#ef4444; margin-top:2px;">
          ${t.sin_entrega || 0} <span style="font-size:13px; font-weight:600; color:var(--text-muted);">(${Math.round(((t.sin_entrega || 0)/(t.docentes_activos || 1))*100)}%)</span>
        </div>
      </div>

      <div style="background:var(--bg); border:1px solid var(--border); border-radius:12px; padding:12px 16px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <small style="color:var(--primary-accent); font-size:11.5px; font-weight:700;">📦 Almacenamiento Supabase</small>
          <span style="font-size:11px; font-weight:800; color:${s.porcentaje_usado > 85 ? '#ef4444' : '#10b981'};">${s.archivos_en_storage || 0} / 700 PDFs</span>
        </div>
        <div style="background:rgba(255,255,255,0.08); height:8px; border-radius:4px; margin-top:8px; overflow:hidden;">
          <div style="background:${s.porcentaje_usado > 85 ? '#ef4444' : 'linear-gradient(90deg, #0284c7, #38bdf8)'}; width:${Math.min(s.porcentaje_usado || 0, 100)}%; height:100%;"></div>
        </div>
      </div>

    </div>

    <!-- Alert si es institucional -->
    ${isInst ? `
      <div style="background:rgba(56,189,248,0.12); border:1px solid rgba(56,189,248,0.35); border-radius:10px; padding:10px 16px; font-size:12.5px; color:#38bdf8; display:flex; align-items:center; gap:8px;">
        <span>ℹ️</span>
        <div><strong>Semana Institucional / Receso Oficial:</strong> En la Semana ${data.semana_consultada} no es obligatoria la entrega de planeaciones didácticas.</div>
      </div>
    ` : ''}

    <!-- Controles de Filtro y Búsqueda -->
    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; background:var(--bg); padding:10px 14px; border-radius:12px; border:1px solid var(--border);">
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <button type="button" onclick="setDiagnosticoFilter('all')" class="btn btn-sm ${currentDiagnosticoFilter === 'all' ? 'btn-primary' : 'btn-light'}" style="font-size:11.5px; font-weight:700; border-radius:6px;">
          Todos (${docs.length})
        </button>
        <button type="button" onclick="setDiagnosticoFilter('issues')" class="btn btn-sm ${currentDiagnosticoFilter === 'issues' ? 'btn-danger' : 'btn-light'}" style="font-size:11.5px; font-weight:700; border-radius:6px; color:#ef4444;">
          🔴 Con Errores / Faltantes (${docs.filter(d => d.severidad !== 'ok' || d.estado_semana === 'sin_entrega' || d.estado_semana === 'no_entrego_cron').length})
        </button>
        <button type="button" onclick="setDiagnosticoFilter('ok')" class="btn btn-sm ${currentDiagnosticoFilter === 'ok' ? 'btn-success' : 'btn-light'}" style="font-size:11.5px; font-weight:700; border-radius:6px; color:#10b981;">
          🟢 Al Día (${docs.filter(d => d.severidad === 'ok' && (d.estado_semana === 'a_tiempo' || d.estado_semana === 'entregado')).length})
        </button>
      </div>

      <div style="flex:1; max-width:320px;">
        <input type="text" id="searchDiagDocente" placeholder="🔍 Buscar por docente o correo..." oninput="renderCurrentDiagnosticoView()" value="${query}" style="width:100%; padding:6px 12px; font-size:12px; background:var(--surface); border:1px solid var(--border); border-radius:8px; color:var(--text-main); outline:none;">
      </div>
    </div>

    <!-- Tabla Detallada de Diagnóstico -->
    <div style="border:1px solid var(--border); border-radius:12px; overflow:hidden; background:var(--bg);">
      <table style="width:100%; border-collapse:collapse; font-size:12px;">
        <thead>
          <tr style="background:rgba(0,0,0,0.25); border-bottom:1.5px solid var(--border); text-align:left;">
            <th style="padding:10px 14px; font-weight:700; color:var(--text-muted);">Docente / Contacto</th>
            <th style="padding:10px 14px; font-weight:700; color:var(--text-muted);">Estado Sem ${data.semana_consultada}</th>
            <th style="padding:10px 14px; font-weight:700; color:var(--text-muted);">Diagnóstico del Error / Causa</th>
            <th style="padding:10px 14px; font-weight:700; color:var(--text-muted); text-align:center;">Acciones de Solución</th>
          </tr>
        </thead>
        <tbody>
          ${filteredDocs.length === 0 ? `
            <tr>
              <td colspan="4" style="text-align:center; padding:30px; color:var(--text-muted);">
                No se encontraron docentes con los filtros aplicados.
              </td>
            </tr>
          ` : filteredDocs.map(d => {
            let badgeHtml = '';
            if (d.estado_semana === 'a_tiempo' || d.estado_semana === 'entregado') {
              badgeHtml = `<span style="background:rgba(16,185,129,0.18); color:#10b981; padding:3px 10px; border-radius:12px; font-weight:700; font-size:11px; display:inline-block;">🟢 Entregó A Tiempo</span>`;
            } else if (d.estado_semana === 'con_retraso') {
              badgeHtml = `<span style="background:rgba(245,158,11,0.18); color:#f59e0b; padding:3px 10px; border-radius:12px; font-weight:700; font-size:11px; display:inline-block;">🟡 Con Retraso</span>`;
            } else if (d.estado_semana === 'no_entrego_cron') {
              badgeHtml = `<span style="background:rgba(239,68,68,0.18); color:#ef4444; border:1px solid rgba(239,68,68,0.3); padding:3px 10px; border-radius:12px; font-weight:700; font-size:11px; display:inline-block;">🔴 Marcado No Entregó (Cron)</span>`;
            } else if (d.estado_semana === 'semana_institucional') {
              badgeHtml = `<span style="background:rgba(148,163,184,0.18); color:#94a3b8; padding:3px 10px; border-radius:12px; font-weight:600; font-size:11px; display:inline-block;">⚪ Semana Receso</span>`;
            } else if (d.estado_semana === 'subio_opcional') {
              badgeHtml = `<span style="background:rgba(56,189,248,0.18); color:#38bdf8; padding:3px 10px; border-radius:12px; font-weight:700; font-size:11px; display:inline-block;">🔵 Subió Opcional</span>`;
            } else {
              badgeHtml = `<span style="background:rgba(239,68,68,0.18); color:#ef4444; padding:3px 10px; border-radius:12px; font-weight:700; font-size:11px; display:inline-block;">🔴 Sin Entrega</span>`;
            }

            const isOk = (d.severidad === 'ok');

            return `
              <tr style="border-bottom:1px solid rgba(255,255,255,0.06); background:${isOk ? 'transparent' : 'rgba(239,68,68,0.03)'};">
                <td style="padding:10px 14px; vertical-align:middle;">
                  <strong style="color:var(--text-main); font-size:12.5px;">${d.nombre}</strong><br>
                  <small style="color:var(--text-muted); font-size:11px;">📧 ${d.correo || 'Sin correo'} • ${d.sede_nombre}</small>
                </td>
                <td style="padding:10px 14px; vertical-align:middle;">
                  ${badgeHtml}
                  ${d.missing_weeks && d.missing_weeks.length > 0 ? `
                    <div style="margin-top:3px; font-size:10.5px; color:#f59e0b; font-weight:600;">
                      Debe anteriores: ${d.missing_weeks.map(w => `Sem ${w}`).join(', ')}
                    </div>
                  ` : ''}
                </td>
                <td style="padding:10px 14px; vertical-align:middle;">
                  <div style="color:${isOk ? '#10b981' : '#f87171'}; font-weight:600; font-size:11.5px;">
                    ${d.causa_exacta}
                  </div>
                  ${d.planeacion_actual ? `
                    <small style="color:var(--text-muted); font-size:10.5px; display:block; margin-top:2px;">
                      📄 Archivo: ${d.planeacion_actual.nombre_archivo ? d.planeacion_actual.nombre_archivo.split('/').pop() : 'Registrado'}
                    </small>
                  ` : ''}
                </td>
                <td style="padding:10px 14px; vertical-align:middle; text-align:center;">
                  <div style="display:inline-flex; gap:4px; flex-wrap:wrap; justify-content:center;">
                    <!-- Botón subir por docente -->
                    <button type="button" onclick="openAdminUploadModal('${d.id}')" class="btn btn-success btn-sm" style="padding:4px 8px; font-size:11px; font-weight:700; border-radius:6px; background:#10b981; border:none;" title="Subir planeación didáctica por este docente">
                      📤 Subir
                    </button>

                    <!-- Botón Justificar -->
                    <button type="button" onclick="repararDocenteSemanaAction(${d.id}, ${data.semana_consultada}, 'justificar', '${(d.nombre || '').replace(/['"]/g, '')}')" class="btn btn-light btn-sm" style="padding:4px 8px; font-size:11px; font-weight:700; border-radius:6px; background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid rgba(56,189,248,0.3);" title="Justificar / Exonerar esta semana para este docente">
                      🔓 Justificar
                    </button>

                    <!-- Limpiar no_entrego si aplica -->
                    ${d.estado_semana === 'no_entrego_cron' ? `
                      <button type="button" onclick="repararDocenteSemanaAction(${d.id}, ${data.semana_consultada}, 'limpiar_no_entrego', '${(d.nombre || '').replace(/['"]/g, '')}')" class="btn btn-danger btn-sm" style="padding:4px 8px; font-size:11px; font-weight:700; border-radius:6px; background:#dc2626;" title="Eliminar registro de 'No Entregó' generado por cron">
                        🧹 Limpiar Falta
                      </button>
                    ` : ''}

                    <!-- Notificar WhatsApp con Guía -->
                    <button type="button" onclick="notifyDocenteReminder('${d.id}')" class="btn btn-light btn-sm" style="padding:4px 8px; font-size:11px; font-weight:700; border-radius:6px;" title="Enviar recordatorio con instrucciones">
                      💬 Recordar
                    </button>

                    <!-- Ver Historial -->
                    <button type="button" onclick="openDocenteExpedienteModal('${d.id}')" class="btn btn-primary btn-sm" style="padding:4px 8px; font-size:11px; font-weight:700; border-radius:6px; background:#0284c7;" title="Ver expediente completo">
                      📁 Historial
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── PESTAÑA 2: LOGS EN TIEMPO REAL DE LA BASE DE DATOS ─────────────────────
function renderDiagnosticoLogsTab(container, data) {
  const logs = data.ultimos_logs || [];

  container.innerHTML = `
    <div style="background:var(--bg); border:1px solid var(--border); border-radius:12px; padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
        <div>
          <h4 style="margin:0; font-size:15px; font-weight:800; color:var(--primary-accent);">
            📜 Registro de Auditoría de Base de Datos (Últimas 30 Planeaciones en Supabase)
          </h4>
          <small style="color:var(--text-muted); font-size:11.5px;">
            Verificación en vivo de registros insertados o modificados, con enlace directo al documento en la nube.
          </small>
        </div>
        <button type="button" onclick="loadDiagnosticoData(${data.semana_consultada})" class="btn btn-light btn-sm" style="padding:4px 10px; font-size:11.5px;">
          🔄 Actualizar Logs
        </button>
      </div>

      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:11.5px;">
          <thead>
            <tr style="background:rgba(0,0,0,0.25); border-bottom:1.5px solid var(--border); text-align:left;">
              <th style="padding:8px 10px; color:var(--text-muted);">ID</th>
              <th style="padding:8px 10px; color:var(--text-muted);">Docente</th>
              <th style="padding:8px 10px; color:var(--text-muted);">Área & Grado</th>
              <th style="padding:8px 10px; color:var(--text-muted);">Semana</th>
              <th style="padding:8px 10px; color:var(--text-muted);">Fecha Registro</th>
              <th style="padding:8px 10px; color:var(--text-muted);">Estado</th>
              <th style="padding:8px 10px; color:var(--text-muted); text-align:center;">Archivo PDF</th>
            </tr>
          </thead>
          <tbody>
            ${logs.length === 0 ? `
              <tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">No hay registros en la base de datos.</td></tr>
            ` : logs.map(l => {
              const fileClean = l.nombre_archivo ? l.nombre_archivo.split('/').pop() : 'Sin archivo';
              const fileUrl = l.nombre_archivo ? (l.nombre_archivo.startsWith('http') ? l.nombre_archivo : `${SUPABASE_STORAGE_BUCKET_URL}/${l.nombre_archivo}`) : null;
              
              return `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                  <td style="padding:8px 10px; font-weight:700; color:var(--text-muted);">#${l.id}</td>
                  <td style="padding:8px 10px; font-weight:700; color:var(--text-main);">${l.docente_nombre}</td>
                  <td style="padding:8px 10px;">${l.area} • <strong>${l.grado}</strong></td>
                  <td style="padding:8px 10px;"><span style="background:rgba(56,189,248,0.15); color:#38bdf8; padding:2px 6px; border-radius:6px; font-weight:700;">Sem ${l.semana}</span></td>
                  <td style="padding:8px 10px; color:var(--text-muted);">${fmtDateTime(l.fecha_subida)}</td>
                  <td style="padding:8px 10px;">
                    <span style="font-size:10.5px; font-weight:700; color:${l.estado === 'a_tiempo' ? '#10b981' : (l.estado === 'no_entrego' ? '#ef4444' : '#f59e0b')};">
                      ${l.estado}
                    </span>
                    ${l.es_rector_ia ? `<span style="font-size:9.5px; padding:1px 5px; background:linear-gradient(135deg, #6366f1, #a855f7); color:#fff; border-radius:8px; margin-left:4px;">Rector IA</span>` : ''}
                  </td>
                  <td style="padding:8px 10px; text-align:center;">
                    ${fileUrl ? `
                      <a href="${fileUrl}" target="_blank" class="btn btn-light btn-sm" style="padding:3px 8px; font-size:10.5px; text-decoration:none; display:inline-flex; align-items:center; gap:4px; font-weight:600;">
                        🔗 Ver PDF
                      </a>
                    ` : '<span style="color:var(--text-muted); font-size:10.5px;">--</span>'}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ── PESTAÑA 3: ALMACENAMIENTO Y SEMANAS INSTITUCIONALES ─────────────────────
function renderDiagnosticoStorageTab(container, data) {
  const s = data.storage || {};
  const instW = data.semanas_institucionales || [];

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:16px;">
      
      <!-- Card Almacenamiento Supabase -->
      <div style="background:var(--bg); border:1px solid var(--border); border-radius:12px; padding:18px;">
        <h4 style="margin:0 0 10px; font-size:15px; font-weight:800; color:#38bdf8; display:flex; align-items:center; gap:8px;">
          📦 Estado del Almacenamiento Supabase Storage
        </h4>
        <p style="font-size:12px; color:var(--text-muted); margin-bottom:14px;">
          Límite máximo de seguridad institucional configurado: <strong>700 archivos PDF</strong> en el bucket <code>planeaciones_pdfs</code>.
        </p>

        <div style="background:rgba(255,255,255,0.06); padding:14px; border-radius:10px; margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:700;">
            <span>Capacidad Ocupada:</span>
            <span style="color:${s.porcentaje_usado > 85 ? '#ef4444' : '#10b981'}; font-weight:800;">
              ${s.archivos_en_storage || 0} de ${s.limite_maximo || 700} PDFs (${s.porcentaje_usado || 0}%)
            </span>
          </div>
          <div style="background:rgba(255,255,255,0.1); height:12px; border-radius:6px; margin-top:8px; overflow:hidden;">
            <div style="background:${s.porcentaje_usado > 85 ? '#ef4444' : 'linear-gradient(90deg, #0284c7, #38bdf8)'}; width:${Math.min(s.porcentaje_usado || 0, 100)}%; height:100%;"></div>
          </div>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" onclick="ejecutarPurgaStorageDesdeDiagnostico()" class="btn btn-danger btn-sm" style="padding:6px 14px; font-size:12px; font-weight:700; background:#dc2626; border:none; border-radius:8px;">
            🧹 Purgar PDFs de Storage para Liberar Espacio
          </button>
        </div>
      </div>

      <!-- Card Semanas Institucionales -->
      <div style="background:var(--bg); border:1px solid var(--border); border-radius:12px; padding:18px;">
        <h4 style="margin:0 0 10px; font-size:15px; font-weight:800; color:#10b981; display:flex; align-items:center; gap:8px;">
          📅 Semanas Institucionales Registradas en BD
        </h4>
        <p style="font-size:12px; color:var(--text-muted); margin-bottom:14px;">
          En estas semanas los docentes <strong>no tienen exigencia de entrega</strong> y el Cron Job nunca los marcará con falta:
        </p>

        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          ${instW.length === 0 ? `
            <span style="color:var(--text-muted); font-size:12px;">No hay semanas institucionales registradas.</span>
          ` : instW.map(item => `
            <div style="background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); border-radius:8px; padding:6px 10px; font-size:12px;">
              <strong style="color:#10b981;">Semana ${item.numero_semana}</strong>
              <small style="color:var(--text-muted); display:block; font-size:10.5px;">${item.motivo || 'Receso'}</small>
            </div>
          `).join('')}
        </div>
      </div>

    </div>
  `;
}

function setDiagnosticoFilter(filter) {
  currentDiagnosticoFilter = filter;
  renderCurrentDiagnosticoView();
}

async function repararDocenteSemanaAction(docenteId, semana, accion, nombreDocente) {
  let promptMsg = '';
  if (accion === 'justificar') {
    promptMsg = `¿Desea justificar y dar por entregada la Semana ${semana} para ${nombreDocente}?`;
  } else if (accion === 'limpiar_no_entrego') {
    promptMsg = `¿Desea eliminar la marca de 'No Entregó' para ${nombreDocente} en la Semana ${semana}?`;
  }
  if (!confirm(promptMsg)) return;

  try {
    const res = await API.Planeaciones.repararSemana({
      docente_id: docenteId,
      semana: semana,
      accion: accion,
      motivo: 'Acción administrativa realizada desde el Centro de Diagnóstico.'
    });

    showToast(res.message || 'Operación completada exitosamente', 'success');
    await loadDiagnosticoData(semana);
    await loadAdminDocentes();
  } catch (err) {
    showToast('Error al reparar semana: ' + (err.message || 'Fallo desconocido'), 'error');
  }
}

async function ejecutarPurgaStorageDesdeDiagnostico() {
  if (!confirm('¿Está seguro de purgar los archivos físicos de Supabase Storage? Los registros en la base de datos se mantendrán intactos.')) return;
  try {
    showToast('Iniciando purga de almacenamiento...', 'info');
    await API.StorageManage.purgar(0);
    showToast('✅ Almacenamiento purgado exitosamente.', 'success');
    if (diagnosticoGlobalData) {
      await loadDiagnosticoData(diagnosticoGlobalData.semana_consultada);
    }
  } catch (err) {
    showToast('Error al purgar almacenamiento: ' + err.message, 'error');
  }
}

function copyDiagnosticoSummary() {
  if (!diagnosticoGlobalData) return;
  const t = diagnosticoGlobalData.totales || {};
  const s = diagnosticoGlobalData.storage || {};
  const docs = diagnosticoGlobalData.docentes || [];

  const issuesList = docs
    .filter(d => d.severidad !== 'ok' || d.estado_semana === 'sin_entrega' || d.estado_semana === 'no_entrego_cron')
    .map(d => `• ${d.nombre} (${d.sede_nombre}): ${d.causa_exacta}`)
    .join('\n');

  const report = `📋 INFORME DE DIAGNÓSTICO INSTITUCIONAL - SEMANA ${diagnosticoGlobalData.semana_consultada}
Fecha de Auditoría: ${new Date().toLocaleString('es-CO')}
─────────────────────────────────────────────
📊 RESUMEN GENERAL:
• Total Docentes Activos: ${t.docentes_activos || 0}
• Docentes Al Día: ${t.al_dia || 0} (${Math.round(((t.al_dia || 0)/(t.docentes_activos || 1))*100)}%)
• Docentes con Faltas / Errores: ${t.sin_entrega || 0}
• Almacenamiento Supabase: ${s.archivos_en_storage || 0} / 700 PDFs (${s.porcentaje_usado || 0}%)

⚠️ DETALLE DE DOCENTES CON PROBLEMAS O PENDIENTES:
${issuesList || 'Ninguno. Todos los docentes están al día.'}
─────────────────────────────────────────────
Generado por SIGEP-IEG • Centro de Diagnóstico Institucional`;

  navigator.clipboard.writeText(report).then(() => {
    showToast('📋 Informe de diagnóstico copiado al portapapeles', 'success');
  }).catch(() => {
    showToast('No se pudo copiar automáticamente al portapapeles', 'warning');
  });
}
