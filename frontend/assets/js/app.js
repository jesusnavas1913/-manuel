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

  const runHide = () => {
    if (user.rol === 'docente') {
      // Ocultar enlaces de módulos administrativos para docentes (Panel Principal, Docentes, Calendario, Reportes)
      document.querySelectorAll('a[href="dashboard.html"], a[href="docentes.html"], a[href="calendario.html"], a[href="reportes.html"]').forEach(el => {
        el.style.display = 'none';
      });

      // Proteger navegación directa por URL
      if (path.endsWith('dashboard.html') || path.endsWith('docentes.html') || path.endsWith('calendario.html') || path.endsWith('reportes.html')) {
        alert('Acceso restringido: Los docentes ingresan directamente a la gestión de sus Planeaciones.');
        window.location.href = 'planeaciones.html';
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runHide);
  } else {
    runHide();
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
      return '<span class="badge ok">Entregado a tiempo</span>';
    case 'retraso':
    case 'Con retraso':
      return '<span class="badge late">Con retraso</span>';
    case 'semana_institucional':
    case 'Semana institucional':
      return '<span class="badge info">Semana institucional</span>';
    case 'no_entrego':
    case 'No entregó':
    default:
      return '<span class="badge no">No entregó</span>';
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
