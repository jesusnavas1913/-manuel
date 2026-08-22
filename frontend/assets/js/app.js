function requireSession() {
  const token = Storage.getToken();
  const user = Storage.getUser();
  const isLoginPage = window.location.pathname.endsWith('index.html') || window.location.pathname.endsWith('/');

  if (!token && !isLoginPage) {
    window.location.href = 'index.html';
    return;
  }

  if (token && user) {
    const userNameEl = document.getElementById('userName');
    const userRoleEl = document.getElementById('userRole');
    if (userNameEl) userNameEl.textContent = user.nombre || user.correo;
    if (userRoleEl) userRoleEl.textContent = user.rol === 'administrador' ? 'Administrador' : 'Docente';

    injectChangePasswordButton();
    applyRolePermissions(user);
    initThemeToggle();
    initImpersonationBanner();
    initNotificationCenter();
  }
}

function initThemeToggle() {
  const currentTheme = localStorage.getItem('theme') || 'light';
  if (currentTheme === 'dark') {
    document.body.classList.add('dark-mode');
  }

  const run = () => {
    const badge = document.querySelector('.user-badge');
    if (badge && !document.getElementById('btnThemeToggle')) {
      const btn = document.createElement('button');
      btn.id = 'btnThemeToggle';
      btn.type = 'button';
      btn.className = 'btn btn-sm btn-light';
      btn.style.marginLeft = '8px';
      btn.style.fontSize = '12px';
      btn.style.padding = '4px 10px';
      btn.style.borderRadius = '20px';
      btn.style.cursor = 'pointer';
      btn.innerHTML = document.body.classList.contains('dark-mode') ? '☀️ Claro' : '🌙 Oscuro';
      
      btn.onclick = () => {
        const isDark = document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        btn.innerHTML = isDark ? '☀️ Claro' : '🌙 Oscuro';
      };

      badge.appendChild(btn);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
}

function injectChangePasswordButton() {
  const run = () => {
    const badge = document.querySelector('.user-badge');
    if (badge && !document.getElementById('btnChangePass')) {
      const btn = document.createElement('button');
      btn.id = 'btnChangePass';
      btn.type = 'button';
      btn.className = 'btn btn-sm btn-light';
      btn.style.marginLeft = '10px';
      btn.style.fontSize = '12px';
      btn.style.padding = '4px 8px';
      btn.innerHTML = '🔒 Cambiar Clave';
      btn.onclick = openChangePasswordModal;
      badge.appendChild(btn);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
}

function openChangePasswordModal() {
  const existing = document.getElementById('passModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'passModal';
  modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); z-index:9999; display:flex; align-items:center; justify-content:center; animation: fadeIn 0.2s ease;';

  modal.innerHTML = `
    <div style="background:var(--card-bg, #ffffff); color:var(--text, #1e293b); border:1px solid var(--border, #e2e8f0); border-radius:16px; padding:28px; max-width:420px; width:92%; box-shadow: 0 20px 30px rgba(0,0,0,0.3);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <h3 style="margin:0; font-size:18px; font-weight:700; color:var(--primary-accent, #2563eb); display:flex; align-items:center; gap:8px;">
          🔒 Cambiar Mi Contraseña
        </h3>
        <button type="button" onclick="document.getElementById('passModal').remove()" style="background:none; border:none; font-size:20px; cursor:pointer; color:var(--text-muted, #64748b);">&times;</button>
      </div>

      <form onsubmit="handlePasswordChangeSubmit(event)">
        <div class="form-group" style="margin-bottom:16px;">
          <label style="display:block; font-size:13px; font-weight:600; margin-bottom:6px;">Contraseña Actual *</label>
          <div style="position:relative; display:flex; align-items:center;">
            <input type="password" id="modalPassOld" required placeholder="Ingresa tu clave actual" style="width:100%; padding:10px 40px 10px 14px; border:1px solid var(--border, #cbd5e1); border-radius:8px; background:var(--bg, #f8fafc); color:inherit; font-size:14px;">
            <button type="button" onclick="toggleModalPassVisibility('modalPassOld', this)" style="position:absolute; right:10px; background:none; border:none; cursor:pointer; font-size:16px; opacity:0.7;">👁️</button>
          </div>
        </div>

        <div class="form-group" style="margin-bottom:24px;">
          <label style="display:block; font-size:13px; font-weight:600; margin-bottom:6px;">Nueva Contraseña *</label>
          <div style="position:relative; display:flex; align-items:center;">
            <input type="password" id="modalPassNew" required placeholder="Ingresa tu nueva clave" style="width:100%; padding:10px 40px 10px 14px; border:1px solid var(--border, #cbd5e1); border-radius:8px; background:var(--bg, #f8fafc); color:inherit; font-size:14px;">
            <button type="button" onclick="toggleModalPassVisibility('modalPassNew', this)" style="position:absolute; right:10px; background:none; border:none; cursor:pointer; font-size:16px; opacity:0.7;">👁️</button>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" class="btn btn-light" onclick="document.getElementById('passModal').remove()">Cancelar</button>
          <button type="submit" class="btn btn-primary" id="btnSavePassModal" style="padding:10px 20px;">Guardar Nueva Clave</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
}

function toggleModalPassVisibility(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    btn.textContent = '🙈';
  } else {
    inp.type = 'password';
    btn.textContent = '👁️';
  }
}

async function handlePasswordChangeSubmit(e) {
  e.preventDefault();
  const oldP = document.getElementById('modalPassOld').value;
  const newP = document.getElementById('modalPassNew').value;
  const btn = document.getElementById('btnSavePassModal');

  if (!oldP || !newP) return;

  btn.disabled = true;
  btn.textContent = '⚡ Guardando clave...';

  try {
    const res = await API.Auth.changePassword(oldP, newP);
    showToast(res.message || 'Contraseña actualizada con éxito', 'success');
    document.getElementById('passModal').remove();
  } catch (err) {
    showToast(err.message || 'Error al cambiar contraseña', 'error');
    btn.disabled = false;
    btn.textContent = 'Guardar Nueva Clave';
  }
}

function applyRolePermissions(user) {
  if (!user) return;
  const path = window.location.pathname.toLowerCase();

  // Agregar clase CSS al body para ocultamiento instantáneo y sin parpadeo
  document.body.classList.remove('role-admin', 'role-docente');
  document.body.classList.add(user.rol === 'administrador' ? 'role-admin' : 'role-docente');

  const runHide = () => {
    if (user.rol === 'docente') {
      // Ocultar únicamente los enlaces de módulos administrativos para docentes
      document.querySelectorAll('a[href="dashboard.html"], a[href="docentes.html"], a[href="calendario.html"], a[href="reportes.html"]').forEach(el => {
        el.style.display = 'none';
      });

      // Actualizar texto del enlace a Mis Planeaciones para docentes
      const planLink = document.querySelector('a[href="planeaciones.html"]');
      if (planLink) {
        planLink.innerHTML = '<span>📁</span> Mis Planeaciones';
      }
      const titleLabel = document.getElementById('topbarTitleLabel');
      if (titleLabel) {
        titleLabel.textContent = '📁 Mis Planeaciones Didácticas';
      }

      // Proteger navegación directa por URL
      if (path.endsWith('dashboard.html') || path.endsWith('docentes.html') || path.endsWith('calendario.html') || path.endsWith('reportes.html')) {
        window.location.href = 'planeaciones.html';
      }
    }
  };

  runHide();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runHide);
  }
}

function logout() {
  Storage.clearSession();
  window.location.href = 'index.html';
}

function fmtDate(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function badge(status) {
  switch (status) {
    case 'a_tiempo':
    case 'Entregado a tiempo':
      return '<span class="badge ok" title="🟢 Entregado a tiempo: Subido dentro del plazo lectivo de la semana">Entregado a tiempo</span>';
    case 'retraso':
    case 'Con retraso':
      return '<span class="badge late" title="🟡 Con retraso: Subido de manera extemporánea. Corrige automáticamente el registro de No Entregó">Con retraso</span>';
    case 'semana_institucional':
    case 'Semana institucional':
      return '<span class="badge info" title="🔵 Semana institucional: Receso o actividad programada">Semana institucional</span>';
    case 'no_entrego':
    case 'No entregó':
    default:
      return '<span class="badge no" title="🔴 No entregó: Semana transcurrida sin registro de entrega (Evaluado desde Semana 32)">No entregó</span>';
  }
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

function showToast(msg, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);

  setTimeout(() => {
    t.remove();
  }, 3500);
}

function cleanObs(obs) {
  if (!obs) return '';
  return obs.replace(/\[Duración:\s*\d+\s*clase\(s\)\]\s*/gi, '').trim();
}

function extractDuracion(obs) {
  if (!obs) return null;
  const match = obs.match(/\[Duración:\s*(\d+)\s*clase\(s\)\]/i);
  return match ? match[1] : null;
}

// ── Funciones de Impersonación (Entrar como Docente) ───────────
async function loginAsDocente(docenteId, docenteNombre) {
  if (!confirm(`¿Desea ingresar y gestionar el sistema como el docente "${docenteNombre}"?`)) return;

  try {
    const currentToken = Storage.getToken();
    const currentUser = Storage.getUser();

    const res = await API.Auth.impersonate(docenteId);
    if (res && res.token) {
      if (currentUser && currentUser.rol === 'administrador') {
        localStorage.setItem('sigep_admin_token', currentToken);
        localStorage.setItem('sigep_admin_user', JSON.stringify(currentUser));
      }

      Storage.setSession(res.token, res.user);
      showToast(`🔑 Ingresó como docente: ${res.user.nombre}`, 'success');
      setTimeout(() => {
        window.location.href = 'planeaciones.html';
      }, 500);
    }
  } catch (err) {
    showToast(err.message || 'Error al ingresar a la cuenta del docente', 'error');
  }
}

function returnToAdminSession() {
  const adminToken = localStorage.getItem('sigep_admin_token');
  const adminUser = localStorage.getItem('sigep_admin_user');

  if (adminToken && adminUser) {
    Storage.setSession(adminToken, JSON.parse(adminUser));
    localStorage.removeItem('sigep_admin_token');
    localStorage.removeItem('sigep_admin_user');
    showToast('↩️ Ha regresado a su cuenta de Administrador', 'info');
    setTimeout(() => {
      window.location.href = 'planeaciones.html';
    }, 500);
  }
}

function initImpersonationBanner() {
  const adminToken = localStorage.getItem('sigep_admin_token');
  const user = Storage.getUser();

  if (adminToken && user && !document.getElementById('impersonationBanner')) {
    const banner = document.createElement('div');
    banner.id = 'impersonationBanner';
    banner.style.cssText = 'background: linear-gradient(90deg, #d97706, #b45309); color: #ffffff; padding: 10px 20px; font-size: 13.5px; font-weight: 600; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 999999; box-shadow: 0 4px 12px rgba(0,0,0,0.2);';
    banner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">⚠️</span>
        <span>Modo de Navegación Activo: <strong>Entraste como el docente ${user.nombre}</strong></span>
      </div>
      <button type="button" onclick="returnToAdminSession()" class="btn btn-sm" style="background: #ffffff; color: #b45309; border: none; font-weight: 700; padding: 6px 14px; border-radius: 6px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
        ⬅️ Volver a Cuenta de Admin
      </button>
    `;
    document.body.prepend(banner);
  }
}

// ── Centro de Notificaciones & Alertas Internas ────────────────
async function initNotificationCenter() {
  const user = Storage.getUser();
  if (!user) return;

  const run = async () => {
    const badge = document.querySelector('.user-badge');
    if (!badge || document.getElementById('btnNotificationBell')) return;

    const btnBell = document.createElement('button');
    btnBell.id = 'btnNotificationBell';
    btnBell.type = 'button';
    btnBell.className = 'notif-bell-btn';
    btnBell.style.cssText = 'position:relative; background:var(--bg, #f1f5f9); border:1px solid var(--border, #cbd5e1); border-radius:50%; width:36px; height:36px; display:inline-flex; align-items:center; justify-content:center; font-size:16px; cursor:pointer; margin-left:8px; transition:all 0.2s ease;';
    btnBell.title = 'Centro de Notificaciones y Alertas';
    btnBell.innerHTML = `🔔 <span id="notifBadgeCount" class="notif-badge-count" style="display:none;">0</span>`;

    badge.insertBefore(btnBell, badge.firstChild);

    const notifications = await generateUserNotifications(user);
    const unreadCount = notifications.filter(n => !n.read).length;

    const countEl = document.getElementById('notifBadgeCount');
    if (countEl && unreadCount > 0) {
      countEl.textContent = unreadCount;
      countEl.style.display = 'inline-block';
    }

    btnBell.onclick = (e) => {
      e.stopPropagation();
      toggleNotificationPopover(notifications);
    };
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
}

async function generateUserNotifications(user) {
  const notifications = [];
  const currentW = weekNumber(new Date());

  try {
    const plansRes = await API.Planeaciones.getAll();
    const plans = Array.isArray(plansRes) ? plansRes : [];

    if (user.rol === 'docente') {
      let myId = user.docente_id;
      if (!myId) {
        try {
          const docsRes = await API.Docentes.getAll();
          const allDocs = Array.isArray(docsRes) ? docsRes : [];
          const myDoc = allDocs.find(d => d.correo && d.correo.toLowerCase() === (user.correo || '').toLowerCase());
          if (myDoc) {
            myId = myDoc.id;
            user.docente_id = myDoc.id;
            Storage.setSession(Storage.getToken(), user);
          }
        } catch (e) {}
      }

      const validPlans = plans.filter(p => p.estado !== 'no_entrego' && String(p.docente_id) === String(myId));
      const currentWeekPlans = validPlans.filter(p => parseInt(p.numero_semana) === currentW);
      const count = currentWeekPlans.length;

      if (count === 0) {
        notifications.push({
          id: 'notif_cuota_semanal',
          icon: '⚠️',
          title: `Entrega Pendiente (Semana ${currentW})`,
          message: `Aún no has registrado planeaciones para la Semana ${currentW}. Recuerda subir tus entregas.`,
          type: 'warning',
          read: false,
          actionText: '📤 Subir Ahora',
          actionUrl: 'planeaciones.html'
        });
      } else {
        notifications.push({
          id: 'notif_cuota_ok',
          icon: '🟢',
          title: `¡Entregas al Día! (Semana ${currentW})`,
          message: `Tienes ${count} ${count === 1 ? 'planeación registrada' : 'planeaciones registradas'} para la Semana ${currentW}.`,
          type: 'success',
          read: true
        });
      }

      notifications.push({
        id: 'notif_plazo_semanal',
        icon: '💡',
        title: 'Plazo de Entrega Ordinario',
        message: 'Recuerda que las entregas a tiempo deben realizarse a más tardar el domingo a las 23:59:59 antes de iniciar la semana de clases.',
        type: 'info',
        read: false
      });

    } else if (user.rol === 'administrador') {
      const docsRes = await API.Docentes.getAll();
      const docentes = Array.isArray(docsRes) ? docsRes : [];
      let pendingCount = 0;

      docentes.forEach(d => {
        const c = plans.filter(p => String(p.docente_id) === String(d.id) && parseInt(p.numero_semana) === currentW && p.estado !== 'no_entrego').length;
        if (c === 0) pendingCount++;
      });

      if (pendingCount > 0) {
        notifications.push({
          id: 'notif_admin_pending',
          icon: '🔴',
          title: `Docentes Sin Entrega (Semana ${currentW})`,
          message: `Hay ${pendingCount} docentes que aún no registran planeaciones en la Semana ${currentW}.`,
          type: 'danger',
          read: false,
          actionText: '📋 Ver Faltantes',
          actionUrl: 'planeaciones.html?filter=pending'
        });
      }

      notifications.push({
        id: 'notif_admin_sigep',
        icon: '📊',
        title: 'Sistema SIGEP en Línea',
        message: 'Monitoreo de entregas en tiempo real activo para Guaimaral, Cuatro Bocas y Altamira.',
        type: 'info',
        read: true
      });
    }
  } catch (err) {
    console.warn('Nota cargando notificaciones:', err.message);
  }

  return notifications;
}

function toggleNotificationPopover(notifications) {
  const existing = document.getElementById('notifDropdownPopover');
  if (existing) {
    existing.remove();
    return;
  }

  const btnBell = document.getElementById('btnNotificationBell');
  if (!btnBell) return;

  const rect = btnBell.getBoundingClientRect();

  const popover = document.createElement('div');
  popover.id = 'notifDropdownPopover';
  popover.className = 'notif-popover';
  popover.style.cssText = `position:fixed; top:${rect.bottom + 8}px; right:${Math.max(10, window.innerWidth - rect.right - 10)}px; width:380px; max-width:92vw; background:var(--surface, #ffffff); color:var(--text-main, #0f172a); border:1px solid var(--border, #e2e8f0); border-radius:16px; box-shadow:0 20px 40px -10px rgba(15,23,42,0.3); z-index:999999; overflow:hidden; animation: popoverFadeIn 0.22s ease-out;`;

  popover.innerHTML = `
    <!-- Topbar Header -->
    <div style="background:var(--bg, #f8fafc); padding:12px 16px; border-bottom:1px solid var(--border, #e2e8f0); display:flex; justify-content:space-between; align-items:center;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:16px;">🔔</span>
        <h4 style="margin:0; font-size:14px; font-weight:800; color:var(--primary-accent, #0284c7);">Alertas & Notificaciones</h4>
      </div>
      <button type="button" onclick="markAllNotificationsRead()" style="background:none; border:none; color:var(--primary-accent, #0284c7); font-size:11.5px; font-weight:700; cursor:pointer;">
        ✓ Leídas
      </button>
    </div>

    <!-- Notifications List -->
    <div style="max-height:340px; overflow-y:auto; padding:12px; display:flex; flex-direction:column; gap:10px;">
      ${notifications.length > 0 ? notifications.map(n => `
        <div style="background:${n.read ? 'var(--bg, #f8fafc)' : 'rgba(56,189,248,0.08)'}; border:1px solid ${n.read ? 'var(--border, #e2e8f0)' : 'var(--primary-accent, #38bdf8)'}; border-radius:12px; padding:10px 12px; display:flex; gap:10px; align-items:flex-start;">
          <span style="font-size:20px; flex-shrink:0;">${n.icon}</span>
          <div style="flex:1;">
            <div style="font-size:12.5px; font-weight:700; color:var(--text-main); margin-bottom:2px;">${n.title}</div>
            <p style="margin:0; font-size:11.5px; color:var(--text-muted); line-height:1.4;">${n.message}</p>
            ${n.actionText ? `
              <a href="${n.actionUrl}" class="btn btn-sm btn-primary" style="display:inline-block; margin-top:8px; padding:3px 10px; font-size:11px; font-weight:700; border-radius:6px; text-decoration:none;">
                ${n.actionText}
              </a>
            ` : ''}
          </div>
        </div>
      `).join('') : '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:12px;">Sin notificaciones recientes</div>'}
    </div>

    <!-- Footer -->
    <div style="background:var(--bg, #f8fafc); padding:8px 16px; border-top:1px solid var(--border, #e2e8f0); text-align:center; font-size:11px; color:var(--text-muted);">
      I.E. Guaimaral · Sistema Académico SIGEP
    </div>
  `;

  document.body.appendChild(popover);

  const outsideClick = (e) => {
    if (!popover.contains(e.target) && !btnBell.contains(e.target)) {
      popover.remove();
      document.removeEventListener('click', outsideClick);
    }
  };
  setTimeout(() => document.addEventListener('click', outsideClick), 50);
}

function markAllNotificationsRead() {
  const countEl = document.getElementById('notifBadgeCount');
  if (countEl) countEl.style.display = 'none';
  const popover = document.getElementById('notifDropdownPopover');
  if (popover) popover.remove();
  showToast('✓ Notificaciones marcadas como leídas', 'success');
}

