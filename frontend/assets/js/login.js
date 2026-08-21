// Verificar sesión previa de forma segura sin bucles en blanco
(async () => {
  try {
    const token = Storage.getToken();
    const _cu = Storage.getUser();
    if (token && _cu) {
      try {
        const me = await API.Auth.me();
        if (me && me.rol) {
          window.location.href = me.rol === 'docente' ? 'planeaciones.html' : 'dashboard.html';
          return;
        }
      } catch (err) {
        Storage.clearSession();
      }
    }
  } catch(e){}
})();

// ── Canvas particles ──────────────────────────────────────────
const canvas = document.getElementById('bgCanvas');
const ctx    = canvas.getContext('2d');
let W, H, pts = [];

function resize() {
  W = canvas.width  = canvas.offsetWidth;
  H = canvas.height = canvas.offsetHeight;
  pts = Array.from({ length: 60 }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    r: Math.random() * 1.5 + 0.5,
    a: Math.random() * 0.4 + 0.1
  }));
}

function drawBg() {
  ctx.clearRect(0, 0, W, H);
  pts.forEach(p => {
    p.x = (p.x + p.vx + W) % W;
    p.y = (p.y + p.vy + H) % H;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(45,212,191,${p.a})`;
    ctx.fill();
  });
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < 110) {
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[j].x, pts[j].y);
        ctx.strokeStyle = `rgba(26,115,232,${(1-d/110)*0.15})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
  }
  requestAnimationFrame(drawBg);
}

window.addEventListener('resize', resize);
resize(); drawBg();

// ── Staggered entrance ────────────────────────────────────────
function animateIn(el, delay, from = 'bottom') {
  if (!el) return;
  const transforms = { bottom: 'translateY(24px)', left: 'translateX(-24px)' };
  el.style.transition = 'opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)';
  el.style.transform = transforms[from] || transforms.bottom;
  setTimeout(() => { el.style.opacity = '1'; el.style.transform = 'none'; }, delay);
}

window.addEventListener('load', () => {
  ['s1','s2','s3'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    setTimeout(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; }, 200 + i * 100);
  });

  [
    { id:'eTag',     delay:100, from:'left'   },
    { id:'eTitle',   delay:200, from:'bottom' },
    { id:'eSub',     delay:280, from:'bottom' },
    { id:'eDivider', delay:350, from:'bottom' },
    { id:'eField1',  delay:420, from:'bottom' },
    { id:'eField2',  delay:490, from:'bottom' },
    { id:'btnSubmit',delay:560, from:'bottom' },
    { id:'eFooter',  delay:640, from:'bottom' },
  ].forEach(({ id, delay, from }) => animateIn(document.getElementById(id), delay, from));

  countUp('countDocentes', 0, 2, 1200);
});

function countUp(id, start, end, duration) {
  const el = document.getElementById(id);
  if (!el) return;
  let current = start;
  const step = Math.ceil(duration / (end - start));
  const timer = setInterval(() => {
    current++;
    el.textContent = current;
    if (current >= end) clearInterval(timer);
  }, step);
}

// ── Ripple ────────────────────────────────────────────────────
function addRipple(e) {
  const btn = document.getElementById('btnSubmit');
  const r = document.createElement('span');
  const d = Math.max(btn.clientWidth, btn.clientHeight);
  const rect = btn.getBoundingClientRect();
  r.className = 'ripple-el';
  r.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX-rect.left-d/2}px;top:${e.clientY-rect.top-d/2}px;`;
  btn.appendChild(r);
  setTimeout(() => r.remove(), 700);
}

// ── Toggle password ───────────────────────────────────────────
function togglePass(btn) {
  const inp = document.getElementById('password');
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const wrap = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${type==='success'?'✓':'✕'}</span> ${msg}`;
  wrap.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'all 0.3s ease';
    t.style.opacity = '0'; t.style.transform = 'translateX(30px)';
    setTimeout(() => t.remove(), 350);
  }, 3500);
}

// ── Login ─────────────────────────────────────────────────────
async function handleLogin(e) {
  e.preventDefault();
  const correo   = document.getElementById('correo').value.trim();
  const password = document.getElementById('password').value;
  const btn      = document.getElementById('btnSubmit');

  btn.disabled = true;
  btn.textContent = '⚡ Verificando acceso...';

  try {
    const data = await API.Auth.login(correo, password);
    Storage.setSession(data.token, data.user);
    showToast('Acceso concedido. Redirigiendo...', 'success');
    setTimeout(() => {
      window.location.href = data.user?.rol === 'docente' ? 'planeaciones.html' : 'dashboard.html';
    }, 700);
  } catch (err) {
    showToast(err.message || 'Credenciales incorrectas', 'error');
    btn.disabled = false;
    btn.textContent = 'VERIFICAR IDENTIDAD E INGRESAR';
    const panel = document.getElementById('rightPanel');
    panel.style.animation = 'none';
    requestAnimationFrame(() => { panel.style.animation = 'shake 0.4s ease'; });
  }
}

// ── Autocompletar Credenciales de Administrador ───────────────
function autoFillAdminCredentials() {
  const correoInp = document.getElementById('correo');
  const passInp = document.getElementById('password');
  if (correoInp) correoInp.value = 'ieguaimaral@guaimaral.edu.co';
  if (passInp) passInp.value = 'admin123';
  showToast('⚡ Credenciales de Administrador cargadas (ieguaimaral@guaimaral.edu.co)', 'success');
}

