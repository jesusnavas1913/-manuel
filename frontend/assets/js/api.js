// ── API Base URL ──────────────────────────────────────────────
// Local dev  → http://localhost:3001/api
// Producción → /api  (Vercel enruta al backend serverless)
var API_BASE = window.API_BASE || (() => {
  const origin = window.location.origin;
  if (window.location.protocol === 'file:' || origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('192.168.') || origin.includes(':5500') || origin.includes(':8080') || origin.includes(':3000')) {
    return 'http://localhost:3001/api';
  }
  return '/api';
})();
window.API_BASE = API_BASE;

var SigepStorage = {
  getToken: function() {
    return localStorage.getItem('sigep_token');
  },
  getUser: function() {
    try {
      const u = localStorage.getItem('sigep_user');
      return u ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  },
  setSession: function(token, user) {
    localStorage.setItem('sigep_token', token);
    localStorage.setItem('sigep_user', JSON.stringify(user));
  },
  clearSession: function() {
    localStorage.removeItem('sigep_token');
    localStorage.removeItem('sigep_user');
  }
};

var Storage = SigepStorage;
window.SigepStorage = SigepStorage;
try {
  window.Storage.getToken = SigepStorage.getToken;
  window.Storage.getUser = SigepStorage.getUser;
  window.Storage.setSession = SigepStorage.setSession;
  window.Storage.clearSession = SigepStorage.clearSession;
} catch (e) {}

async function apiFetch(endpoint, options = {}) {
  const token = Storage.getToken();
  const headers = {
    ...(options.headers || {})
  };

  if (!(options.body instanceof FormData)) {
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  } else {
    delete headers['Content-Type'];
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    if (response.status === 401 && !endpoint.includes('/auth/login')) {
      Storage.clearSession();
      if (!window.location.pathname.endsWith('index.html') && !window.location.pathname.endsWith('/') && !window.location.pathname.endsWith('login.html')) {
        window.location.href = 'login.html';
      }
      throw new Error('Sesión expirada o no autorizada');
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const detailMsg = Array.isArray(data.detalles) ? data.detalles.map(d => d.msg).join(', ') : '';
      throw new Error(detailMsg || data.error || 'Ocurrió un error en la solicitud');
    }

    return data;
  } catch (err) {
    console.error('API Error:', err);
    throw err;
  }
}

var API = window.API || {
  Auth: {
    login: (correo, password) => apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ correo, password })
    }),
    me: () => apiFetch('/auth/me'),
    register: (data) => apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    changePassword: (password_actual, password_nuevo) => apiFetch('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ password_actual, password_nuevo })
    }),
    impersonate: (docente_id) => apiFetch('/auth/impersonate', {
      method: 'POST',
      body: JSON.stringify({ docente_id })
    })
  },
  Docentes: {
    getAll: () => apiFetch('/docentes'),
    getOne: (id) => apiFetch(`/docentes/${id}`),
    create: (data) => apiFetch('/docentes', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    update: (id, data) => apiFetch(`/docentes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    remove: (id) => apiFetch(`/docentes/${id}`, {
      method: 'DELETE'
    }),
    delete: (id) => apiFetch(`/docentes/${id}`, {
      method: 'DELETE'
    }),
    getSedes: () => apiFetch('/docentes/sedes'),
    getJornadas: () => apiFetch('/docentes/jornadas')
  },
  Planeaciones: {
    getAll: () => apiFetch('/planeaciones'),
    create: (data) => apiFetch('/planeaciones', {
      method: 'POST',
      body: data instanceof FormData ? data : JSON.stringify(data)
    }),
    update: (id, data) => apiFetch(`/planeaciones/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    remove: (id, passwordConfirmacion) => apiFetch(`/planeaciones/${id}`, {
      method: 'DELETE',
      body: passwordConfirmacion ? JSON.stringify({ password_confirmacion: passwordConfirmacion }) : undefined
    })
  },
  Semanas: {
    getAll: () => apiFetch('/semanas'),
    create: (data) => apiFetch('/semanas', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    remove: (id) => apiFetch(`/semanas/${id}`, {
      method: 'DELETE'
    })
  },
  Reportes: {
    getKPI: () => apiFetch('/reportes/kpi'),
    getReporte: (params = {}) => {
      const query = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) query.append(k, v);
      });
      const qs = query.toString() ? `?${query.toString()}` : '';
      return apiFetch(`/reportes${qs}`);
    }
  },
  StorageManage: {
    getStatus: () => apiFetch('/planeaciones/storage-status'),
    purgar: (mantenerRecientes = 0) => apiFetch('/planeaciones/purgar-storage', {
      method: 'POST',
      body: JSON.stringify({ mantenerRecientes })
    })
  }
};

