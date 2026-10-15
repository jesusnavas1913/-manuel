-- ==========================================================
-- ESQUEMA DE BASE DE DATOS SIGEP-IEG (PostgreSQL / Supabase / AWS RDS)
-- Institución Educativa Guaimaral - Gestión de Planeaciones
-- ==========================================================

-- 1. Tabla de Usuarios (Autenticación del Sistema)
CREATE TABLE IF NOT EXISTS usuarios (
  id BIGSERIAL PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  correo VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  rol VARCHAR(50) NOT NULL DEFAULT 'docente' CHECK (rol IN ('administrador', 'docente', 'coordinador')),
  docente_id BIGINT,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de Docentes (Planta Docente Institucional)
CREATE TABLE IF NOT EXISTS docentes (
  id BIGSERIAL PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL,
  documento VARCHAR(50) UNIQUE,
  correo VARCHAR(255),
  sede_id INT, -- 1: Principal, 2: Hermógenes Maza, 3: Alianza, 4: María Goretti, etc.
  jornada_id INT, -- 1: Mañana, 2: Tarde, 3: Única, 4: Nocturna
  sede_nombre VARCHAR(100),
  jornada_nombre VARCHAR(50),
  areas TEXT,
  grados TEXT,
  clave_inicial VARCHAR(100) DEFAULT 'admin123',
  estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de Planeaciones (Entregas y Secuencias Didácticas)
CREATE TABLE IF NOT EXISTS planeaciones (
  id BIGSERIAL PRIMARY KEY,
  docente_id BIGINT NOT NULL,
  area VARCHAR(255) NOT NULL,
  grado VARCHAR(100) NOT NULL,
  fecha_aplicacion DATE,
  fecha_subida TIMESTAMPTZ DEFAULT NOW(),
  numero_semana INT NOT NULL,
  nombre_archivo TEXT,
  observaciones TEXT,
  estado VARCHAR(50) DEFAULT 'a_tiempo' CHECK (estado IN ('a_tiempo', 'retraso', 'no_entrego', 'semana_institucional')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabla de Semanas Institucionales (Recesos, Desarrollo Institucional)
CREATE TABLE IF NOT EXISTS semanas_institucionales (
  id BIGSERIAL PRIMARY KEY,
  anio INT NOT NULL,
  numero_semana INT NOT NULL,
  motivo VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_anio_semana UNIQUE (anio, numero_semana)
);

-- Índices de Rendimiento
CREATE INDEX IF NOT EXISTS idx_planeaciones_docente ON planeaciones (docente_id);
CREATE INDEX IF NOT EXISTS idx_planeaciones_semana ON planeaciones (numero_semana);
CREATE INDEX IF NOT EXISTS idx_planeaciones_estado ON planeaciones (estado);
CREATE INDEX IF NOT EXISTS idx_docentes_correo ON docentes (correo);
CREATE INDEX IF NOT EXISTS idx_docentes_documento ON docentes (documento);

-- Deshabilitar RLS para permitir operaciones de la aplicación
ALTER TABLE usuarios DISABLE ROW LEVEL SECURITY;
ALTER TABLE docentes DISABLE ROW LEVEL SECURITY;
ALTER TABLE planeaciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE semanas_institucionales DISABLE ROW LEVEL SECURITY;

-- Crear el bucket de almacenamiento de PDFs
INSERT INTO storage.buckets (id, name, public) 
VALUES ('planeaciones_pdfs', 'planeaciones_pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Permitir acceso público de subida y lectura en el bucket
CREATE POLICY "Public Access" ON storage.objects FOR ALL USING (bucket_id = 'planeaciones_pdfs');

-- Usuario Administrador Oficial Inicial
-- Contraseña por defecto: admin123 (hash bcrypt)
INSERT INTO usuarios (nombre, correo, password_hash, rol, activo)
VALUES (
  'I.E. Guaimaral',
  'ieguaimaral@guaimaral.edu.co',
  '$2a$10$wT5H8B5QO7G7V.BqR8XkQ.kM6u8kK8sH6z7kK8sH6z7kK8sH6z7kK',
  'administrador',
  true
)
ON CONFLICT (correo) DO UPDATE
SET rol = 'administrador', activo = true;