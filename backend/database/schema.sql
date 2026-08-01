-- =============================================
-- SIGEP-IEG - Schema PostgreSQL Limpio para Supabase
-- =============================================

DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS planeaciones CASCADE;
DROP TABLE IF EXISTS semanas_institucionales CASCADE;
DROP TABLE IF EXISTS docentes CASCADE;
DROP TABLE IF EXISTS sedes CASCADE;
DROP TABLE IF EXISTS jornadas CASCADE;

-- 1. Sedes educativas
CREATE TABLE sedes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  activa BOOLEAN DEFAULT true
);

-- 2. Jornadas (Mañana / Tarde / Nocturna)
CREATE TABLE jornadas (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL
);

-- 3. Docentes
CREATE TABLE docentes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(160) NOT NULL,
  documento VARCHAR(30),
  correo VARCHAR(160),
  sede_id INT REFERENCES sedes(id) ON DELETE SET NULL,
  jornada_id INT REFERENCES jornadas(id) ON DELETE SET NULL,
  areas TEXT,
  grados TEXT,
  clave_inicial VARCHAR(100) DEFAULT 'admin123',
  estado VARCHAR(10) DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo'))
);

-- 4. Planeaciones
CREATE TABLE planeaciones (
  id BIGSERIAL PRIMARY KEY,
  docente_id INT NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
  area VARCHAR(120),
  grado VARCHAR(30),
  fecha_aplicacion DATE,
  numero_semana SMALLINT,
  fecha_subida TIMESTAMP DEFAULT NOW(),
  nombre_archivo VARCHAR(255),
  observaciones TEXT,
  estado VARCHAR(25) CHECK (estado IN ('a_tiempo', 'retraso', 'no_entrego', 'semana_institucional'))
);

-- 5. Semanas institucionales (no generan incumplimiento)
CREATE TABLE semanas_institucionales (
  id SERIAL PRIMARY KEY,
  anio SMALLINT NOT NULL,
  numero_semana SMALLINT NOT NULL,
  motivo VARCHAR(255)
);

-- 6. Usuarios del sistema (admin + docentes)
CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(160) NOT NULL,
  correo VARCHAR(160) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol VARCHAR(15) NOT NULL CHECK (rol IN ('administrador', 'docente')),
  docente_id INT REFERENCES docentes(id) ON DELETE SET NULL,
  activo BOOLEAN DEFAULT true
);

-- =============================================
-- Datos iniciales (I.E. Guaimaral, I.E. Cuatro Bocas, I.E. Altamira)
-- =============================================
INSERT INTO sedes (nombre) VALUES ('I.E. Guaimaral'), ('I.E. Cuatro Bocas'), ('I.E. Altamira');
INSERT INTO jornadas (nombre) VALUES ('Mañana'), ('Tarde'), ('Nocturna');

INSERT INTO usuarios (nombre, correo, password_hash, rol)
VALUES (
  'Pedro',
  'pedro@guaimaral.edu.co',
  '$2a$10$ofja/PBGaXb9aQx6B78mcObKbTU4cXjbgvTw6N/NYGlhlH7suSHA6',
  'administrador'
);

-- Desactivar Row-Level Security (RLS) en todas las tablas para permitir consultas e inserciones
ALTER TABLE sedes DISABLE ROW LEVEL SECURITY;
ALTER TABLE jornadas DISABLE ROW LEVEL SECURITY;
ALTER TABLE docentes DISABLE ROW LEVEL SECURITY;
ALTER TABLE planeaciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE semanas_institucionales DISABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios DISABLE ROW LEVEL SECURITY;
