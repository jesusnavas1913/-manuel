let reportRows = [];
let currentPage = 1;
let totalPages = 1;
let totalItems = 0;

// Sort logic requires server implementation in backend, or local sort.
// For now we will sort locally on the current page data.
let sortCol = 'docente_nombre';
let sortAsc = true;

async function initReportesPage() {
  await loadFilterOptions();
  await fetchReport();
}

async function loadFilterOptions() {
  try {
    const user = Storage.getUser();
    if (user && user.rol !== 'docente') {
      const docentes = await API.Docentes.getAll();
      const docSel = document.getElementById('fDocente');
      docSel.innerHTML = '<option value="">Todos los docentes</option>' +
        docentes.map(d => `<option value="${d.id}">${d.nombre}</option>`).join('');
    } else {
      document.getElementById('fDocente').style.display = 'none';
    }

    const sedes = await API.Docentes.getSedes();
    const sedesSel = document.getElementById('fSede');
    sedesSel.innerHTML = '<option value="">Todas las sedes</option>' +
      sedes.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('');

    const jornadas = await API.Docentes.getJornadas();
    const jornadasSel = document.getElementById('fJornada');
    jornadasSel.innerHTML = '<option value="">Todas las jornadas</option>' +
      jornadas.map(j => `<option value="${j.id}">${j.nombre}</option>`).join('');
  } catch (err) {
    showToast('Error al cargar opciones de filtros', 'error');
  }
}

async function fetchReport(page = 1) {
  try {
    currentPage = page;
    
    const fDoc = document.getElementById('fDocente').value;
    const fSede = document.getElementById('fSede').value;
    const fJornada = document.getElementById('fJornada').value;
    const fGrado = (document.getElementById('fGrado').value || '').trim();
    const fEstado = document.getElementById('fEstado').value;
    const fSemana = document.getElementById('fSemana').value;
    
    const params = {
      page: currentPage,
      limit: 25,
      docente_id: fDoc,
      sede_id: fSede,
      jornada_id: fJornada,
      grado: fGrado,
      estado: fEstado,
      semana: fSemana
    };
    
    const res = await API.Reportes.getReporte(params);
    
    // Paginación desde backend
    reportRows = res.data || [];
    totalPages = res.totalPages || 1;
    totalItems = res.total || 0;

    // Búsqueda en texto para la página actual
    const qSearch = (document.getElementById('fSearch').value || '').toLowerCase().trim();
    if (qSearch) {
      reportRows = reportRows.filter(r => {
        return (r.docente_nombre || '').toLowerCase().includes(qSearch) ||
               (r.docente_doc || '').toLowerCase().includes(qSearch) ||
               (r.sede_nombre || '').toLowerCase().includes(qSearch) ||
               (r.jornada_nombre || '').toLowerCase().includes(qSearch) ||
               (r.area || '').toLowerCase().includes(qSearch) ||
               (r.grado || '').toLowerCase().includes(qSearch) ||
               (r.nombre_archivo || '').toLowerCase().includes(qSearch);
      });
    }
    
    applyLocalSort();
    renderReport();
    updateLiveStats();
    updateFilterChips();
    updatePaginationUI();
  } catch (err) {
    showToast('Error al obtener datos del reporte', 'error');
  }
}

function applyFiltersInstant() {
  fetchReport(1);
}

function changePage(delta) {
  const newPage = currentPage + delta;
  if (newPage >= 1 && newPage <= totalPages) {
    fetchReport(newPage);
  }
}

function updatePaginationUI() {
  document.getElementById('lblCurrentPage').textContent = currentPage;
  document.getElementById('lblTotalPages').textContent = totalPages;
  document.getElementById('btnPrevPage').disabled = currentPage <= 1;
  document.getElementById('btnNextPage').disabled = currentPage >= totalPages;
}

function applyLocalSort() {
  reportRows.sort((a, b) => {
    let valA = a[sortCol] || '';
    let valB = b[sortCol] || '';
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });
}

function updateLiveStats() {
  // Calculamos las estadísticas solo para los elementos de la página actual 
  // (ya que las estadísticas globales requerirían otra llamada al backend).
  let aTiempo = 0, retraso = 0, noEntrego = 0;
  reportRows.forEach(r => {
    if (r.estado === 'a_tiempo') aTiempo++;
    else if (r.estado === 'retraso') retraso++;
    else noEntrego++;
  });
  const currentTotal = reportRows.length;

  const statTotalEl = document.getElementById('statTotal');
  if (statTotalEl) statTotalEl.textContent = totalItems + " (Todos)";

  const statATiempoEl = document.getElementById('statATiempo');
  if (statATiempoEl) statATiempoEl.textContent = `${aTiempo} (en pág)`;

  const statRetrasoEl = document.getElementById('statRetraso');
  if (statRetrasoEl) statRetrasoEl.textContent = `${retraso} (en pág)`;

  const statNoEntregoEl = document.getElementById('statNoEntrego');
  if (statNoEntregoEl) statNoEntregoEl.textContent = `${noEntrego} (en pág)`;
}

function updateFilterChips() {
  const chipsDiv = document.getElementById('activeFilterChips');
  if (!chipsDiv) return;

  const filters = getFilterSummary();
  const qSearch = document.getElementById('fSearch').value.trim();
  const chips = [];

  if (qSearch) chips.push({ label: `Búsqueda: "${qSearch}"`, clear: () => { document.getElementById('fSearch').value = ''; } });
  if (document.getElementById('fDocente').value) chips.push({ label: `Docente: ${filters.docenteText}`, clear: () => { document.getElementById('fDocente').value = ''; } });
  if (document.getElementById('fSede').value) chips.push({ label: `Sede: ${filters.sedeText}`, clear: () => { document.getElementById('fSede').value = ''; } });
  if (document.getElementById('fJornada').value) chips.push({ label: `Jornada: ${filters.jornadaText}`, clear: () => { document.getElementById('fJornada').value = ''; } });
  if (document.getElementById('fGrado').value) chips.push({ label: `Grado: ${filters.gradoText}`, clear: () => { document.getElementById('fGrado').value = ''; } });
  if (document.getElementById('fEstado').value) chips.push({ label: `Estado: ${filters.estadoText}`, clear: () => { document.getElementById('fEstado').value = ''; } });
  if (document.getElementById('fSemana').value) chips.push({ label: `Semana: ${filters.semanaText}`, clear: () => { document.getElementById('fSemana').value = ''; } });

  if (chips.length === 0) {
    chipsDiv.innerHTML = '';
    return;
  }

  window._chipClears = chips.map(c => c.clear);
  chipsDiv.innerHTML = '<span style="color:var(--text-muted); font-weight:600;">Filtros activos:</span> ' +
    chips.map((c, i) => `
      <span style="background:var(--bg); border:1px solid var(--border); padding:3px 10px; border-radius:14px; color:var(--primary-accent); font-weight:700; display:inline-flex; align-items:center; gap:6px;">
        ${c.label}
        <span onclick="window._chipClears[${i}](); applyFiltersInstant();" style="cursor:pointer; font-weight:bold; color:var(--danger);">&times;</span>
      </span>
    `).join('');
}

function sortReportBy(col) {
  if (sortCol === col) {
    sortAsc = !sortAsc;
  } else {
    sortCol = col;
    sortAsc = true;
  }
  applyLocalSort();
  renderReport();
}

function renderReport() {
  const tbody = document.getElementById('reportTableBody');

  if (!reportRows || reportRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 20px;">No se encontraron registros con los filtros seleccionados</td></tr>`;
    return;
  }

  tbody.innerHTML = reportRows.map(r => `
    <tr>
      <td><strong>${r.docente_nombre || '-'}</strong></td>
      <td>${r.docente_doc || '-'}</td>
      <td>${r.sede_nombre || '-'}</td>
      <td>${r.jornada_nombre || '-'}</td>
      <td>${r.area || '-'}</td>
      <td>${r.grado || '-'}</td>
      <td>Semana ${r.numero_semana || '-'}</td>
      <td>${fmtDate(r.fecha_subida)}</td>
      <td>${badge(r.estado)}</td>
      <td style="max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${r.nombre_archivo && r.nombre_archivo.startsWith('http') ? `<a href="${r.nombre_archivo}" target="_blank" style="color:var(--primary-accent); font-weight:bold; text-decoration:none;">📥 Ver PDF</a>` : `<code>${r.nombre_archivo || '-'}</code>`}
      </td>
    </tr>
  `).join('');
}

function clearFilters() {
  document.getElementById('fSearch').value = '';
  document.getElementById('fDocente').value = '';
  document.getElementById('fSede').value = '';
  document.getElementById('fJornada').value = '';
  document.getElementById('fGrado').value = '';
  document.getElementById('fEstado').value = '';
  document.getElementById('fSemana').value = '';
  applyFiltersInstant();
}

function getFilterSummary() {
  const docSel = document.getElementById('fDocente');
  const docenteText = docSel && docSel.options[docSel.selectedIndex] && docSel.value ? docSel.options[docSel.selectedIndex].text : 'Todos los docentes';

  const sedeSel = document.getElementById('fSede');
  const sedeText = sedeSel && sedeSel.options[sedeSel.selectedIndex] && sedeSel.value ? sedeSel.options[sedeSel.selectedIndex].text : 'Todas las sedes';

  const jornadaSel = document.getElementById('fJornada');
  const jornadaText = jornadaSel && jornadaSel.options[jornadaSel.selectedIndex] && jornadaSel.value ? jornadaSel.options[jornadaSel.selectedIndex].text : 'Todas las jornadas';

  const gradoText = document.getElementById('fGrado').value.trim() || 'Todos los grados';

  const estadoSel = document.getElementById('fEstado');
  const estadoText = estadoSel && estadoSel.options[estadoSel.selectedIndex] && estadoSel.value ? estadoSel.options[estadoSel.selectedIndex].text : 'Todos los estados';

  const semanaVal = document.getElementById('fSemana').value;
  const semanaText = semanaVal ? `Semana ${semanaVal}` : 'Todas las semanas';

  return { docenteText, sedeText, jornadaText, gradoText, estadoText, semanaText };
}

function exportExcel() {
  if (!reportRows || reportRows.length === 0) {
    showToast('No hay datos para exportar', 'error');
    return;
  }

  const filters = getFilterSummary();
  const now = new Date();
  const fechaGen = now.toLocaleString('es-CO');

  const excelContent = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<!--[if gte mso 9]>
<xml>
<x:ExcelWorkbook>
  <x:ExcelWorksheets>
    <x:ExcelWorksheet>
      <x:Name>Reporte SIGEP</x:Name>
      <x:WorksheetOptions>
        <x:DisplayGridlines/>
      </x:WorksheetOptions>
    </x:ExcelWorksheet>
  </x:ExcelWorksheets>
</x:ExcelWorkbook>
</xml>
<![endif]-->
<style>
body { font-family: Arial, sans-serif; font-size: 11pt; }
.title-main { background-color: #091e3a; color: #ffffff; font-size: 16pt; font-weight: bold; text-align: center; vertical-align: middle; height: 45px; }
.title-sub { background-color: #1e40af; color: #ffffff; font-size: 11pt; font-weight: bold; text-align: center; vertical-align: middle; height: 28px; }
.title-desc { background-color: #eff6ff; color: #0f2d59; font-size: 10.5pt; font-weight: bold; text-align: center; vertical-align: middle; height: 25px; border: 1px solid #bfdbfe; }
.meta-label { font-weight: bold; background-color: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1; padding: 6px; }
.meta-val { background-color: #ffffff; color: #334155; border: 1px solid #cbd5e1; padding: 6px; }
th { background-color: #091e3a; color: #ffffff; font-weight: bold; font-size: 10.5pt; border: 1px solid #091e3a; text-align: center; height: 35px; vertical-align: middle; }
td { border: 1px solid #cbd5e1; font-size: 10pt; vertical-align: middle; padding: 6px 10px; }
tr:nth-child(even) td { background-color: #f8fafc; }
.badge-a_tiempo { background-color: #dcfce7; color: #15803d; font-weight: bold; text-align: center; }
.badge-retraso { background-color: #fef9c3; color: #854d0e; font-weight: bold; text-align: center; }
.badge-semana_institucional { background-color: #e0f2fe; color: #0369a1; font-weight: bold; text-align: center; }
.badge-no_entrego { background-color: #fee2e2; color: #991b1b; font-weight: bold; text-align: center; }
</style>
</head>
<body>
<table>
<!-- Encabezado Institucional de Alta Calidad -->
<tr>
  <td colspan="12" class="title-main">INSTITUCIÓN EDUCATIVA GUAIMARAL</td>
</tr>
<tr>
  <td colspan="12" class="title-sub">SISTEMA DE GESTIÓN DE PLANEACIONES DIDÁCTICAS (SIGEP)</td>
</tr>
<tr>
  <td colspan="12" class="title-desc">INFORME EJECUTIVO DE CUMPLIMIENTO INSTITUCIONAL</td>
</tr>
<tr><td colspan="12" style="height: 10px; border:none;"></td></tr>

<!-- Metadatos del Reporte y Filtros Aplicados -->
<tr>
  <td colspan="2" class="meta-label">Fecha de Generación:</td>
  <td colspan="4" class="meta-val">${fechaGen}</td>
  <td colspan="2" class="meta-label">Total de Registros:</td>
  <td colspan="4" class="meta-val"><b>${reportRows.length}</b></td>
</tr>
<tr>
  <td colspan="2" class="meta-label">Docente:</td>
  <td colspan="2" class="meta-val">${filters.docenteText}</td>
  <td colspan="2" class="meta-label">Sede:</td>
  <td colspan="2" class="meta-val">${filters.sedeText}</td>
  <td colspan="2" class="meta-label">Jornada:</td>
  <td colspan="2" class="meta-val">${filters.jornadaText}</td>
</tr>
<tr>
  <td colspan="2" class="meta-label">Grado:</td>
  <td colspan="2" class="meta-val">${filters.gradoText}</td>
  <td colspan="2" class="meta-label">Estado:</td>
  <td colspan="2" class="meta-val">${filters.estadoText}</td>
  <td colspan="2" class="meta-label">Semana:</td>
  <td colspan="2" class="meta-val">${filters.semanaText}</td>
</tr>
<tr><td colspan="12" style="height: 14px; border:none;"></td></tr>

<!-- Encabezados de Tabla -->
<thead>
  <tr>
    <th>Docente</th>
    <th>Documento</th>
    <th>Sede</th>
    <th>Jornada</th>
    <th>Área</th>
    <th>Grado</th>
    <th>Semana</th>
    <th>Fecha Aplicación</th>
    <th>Fecha Subida</th>
    <th>Estado</th>
    <th>Nombre Archivo</th>
    <th>Observaciones</th>
  </tr>
</thead>
<tbody>
  ${reportRows.map(r => {
    let stateClass = 'badge-no_entrego';
    let stateLabel = 'No entregó';
    if (r.estado === 'a_tiempo') { stateClass = 'badge-a_tiempo'; stateLabel = 'Entregado a tiempo'; }
    else if (r.estado === 'retraso') { stateClass = 'badge-retraso'; stateLabel = 'Con retraso'; }
    else if (r.estado === 'semana_institucional') { stateClass = 'badge-semana_institucional'; stateLabel = 'Semana institucional'; }

    return `
      <tr>
        <td><b>${r.docente_nombre || '-'}</b></td>
        <td style="text-align: center;">${r.docente_doc || '-'}</td>
        <td>${r.sede_nombre || '-'}</td>
        <td>${r.jornada_nombre || '-'}</td>
        <td>${r.area || '-'}</td>
        <td style="text-align: center;">${r.grado || '-'}</td>
        <td style="text-align: center;">Semana ${r.numero_semana || '-'}</td>
        <td style="text-align: center;">${r.fecha_aplicacion ? r.fecha_aplicacion.split('T')[0] : '-'}</td>
        <td style="text-align: center;">${fmtDate(r.fecha_subida)}</td>
        <td class="${stateClass}">${stateLabel}</td>
        <td>${r.nombre_archivo || '-'}</td>
        <td>${cleanObs(r.observaciones)}</td>
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
  link.download = `reporte_sigep_guaimaral_${new Date().toISOString().slice(0, 10)}.xls`;
  link.click();
  showToast('Reporte en Excel (.xls) descargado con éxito', 'success');
}

function exportCSV() {
  if (!reportRows || reportRows.length === 0) {
    showToast('No hay datos para exportar', 'error');
    return;
  }

  const filters = getFilterSummary();
  const now = new Date();

  let csv = 'INSTITUCIÓN EDUCATIVA GUAIMARAL - SISTEMA DE GESTIÓN DE PLANEACIONES (SIGEP)\n';
  csv += 'INFORME DE CUMPLIMIENTO INSTITUCIONAL\n';
  csv += `Fecha de Generación:;${now.toLocaleString('es-CO')};;Total de Registros:;${reportRows.length}\n`;
  csv += `Filtros:;Docente: ${filters.docenteText};Sede: ${filters.sedeText};Jornada: ${filters.jornadaText};Grado: ${filters.gradoText};Estado: ${filters.estadoText};Semana: ${filters.semanaText}\n\n`;

  const headers = 'Docente;Documento;Sede;Jornada;Área;Grado;Semana;Fecha Aplicación;Fecha Subida;Estado;Archivo;Observaciones\n';
  const body = reportRows.map(r => {
    let stateLabel = 'No entregó';
    if (r.estado === 'a_tiempo') stateLabel = 'Entregado a tiempo';
    else if (r.estado === 'retraso') stateLabel = 'Con retraso';
    else if (r.estado === 'semana_institucional') stateLabel = 'Semana institucional';

    return [
      `"${r.docente_nombre || ''}"`,
      `"${r.docente_doc || ''}"`,
      `"${r.sede_nombre || ''}"`,
      `"${r.jornada_nombre || ''}"`,
      `"${r.area || ''}"`,
      `"${r.grado || ''}"`,
      r.numero_semana || '',
      r.fecha_aplicacion ? r.fecha_aplicacion.split('T')[0] : '',
      r.fecha_subida || '',
      `"${stateLabel}"`,
      `"${r.nombre_archivo || ''}"`,
      `"${cleanObs(r.observaciones).replace(/"/g, '""')}"`
    ].join(';');
  }).join('\n');

  const blob = new Blob(['\ufeff' + csv + headers + body], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `reporte_guaimaral_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  showToast('Reporte CSV descargado con éxito', 'success');
}

function exportPDF() {
  if (!reportRows || reportRows.length === 0) {
    showToast('No hay datos para exportar a PDF', 'error');
    return;
  }
  window.print();
}
