// ── API Base URL ──────────────────────────────────────────────
// Local dev  → http://localhost:3001/api
// Producción → /api  (Vercel enruta al backend serverless)
const API_BASE = (() => {
  const origin = window.location.origin;
  if (origin.includes('localhost') || origin.includes('127.0.0.1') || window.location.protocol === 'file:') {
    return 'http://localhost:3001/api';
  }
  return '/api';
})();


const Storage = {
  getToken: () => localStorage.getItem('sigep_token'),
  getUser: () => {
    const u = localStorage.getItem('sigep_user');
    return u ? JSON.parse(u) : null;
  },
  setSession: (token, user) => {
    localStorage.setItem('sigep_token', token);
    localStorage.setItem('sigep_user', JSON.stringify(user));
  },
  clearSession: () => {
    localStorage.removeItem('sigep_token');
    localStorage.removeItem('sigep_user');
  }
};

async function apiFetch(endpoint, options = {}) {
  const token = Storage.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

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
      if (!window.location.pathname.endsWith('index.html') && !window.location.pathname.endsWith('/')) {
        window.location.href = 'index.html';
      }
      throw new Error('Sesión expirada o no autorizada');
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Ocurrió un error en la solicitud');
    }

    return data;
  } catch (err) {
    console.error('API Error:', err);
    throw err;
  }
}

const API = {
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
    getSedes: () => apiFetch('/docentes/sedes'),
    getJornadas: () => apiFetch('/docentes/jornadas')
  },
  Planeaciones: {
    getAll: () => apiFetch('/planeaciones'),
    create: (data) => apiFetch('/planeaciones', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    update: (id, data) => apiFetch(`/planeaciones/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    remove: (id) => apiFetch(`/planeaciones/${id}`, {
      method: 'DELETE'
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
  }
};
