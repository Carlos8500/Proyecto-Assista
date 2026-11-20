BEGIN;

INSERT INTO negocios (nombre)
SELECT 'Mesa Clara'
WHERE NOT EXISTS (
    SELECT 1 FROM negocios WHERE nombre = 'Mesa Clara'
);

INSERT INTO negocios (nombre)
SELECT 'Comedor Reforma'
WHERE NOT EXISTS (
    SELECT 1 FROM negocios WHERE nombre = 'Comedor Reforma'
);

-- Cuentas de prueba (contraseña para Mesa Clara: MesaClara2026 | Comedor Reforma: Reforma2026)
INSERT INTO usuarios (negocio_id, nombre, username, correo, password_hash, rol)
SELECT
    n.id,
    'Lucía García',
    'lucia.garcia',
    'lucia.garcia@mesaclara.mx',
    '$argon2id$v=19$m=19456,t=2,p=1$CdM2I61pBhwr7OMjIV0mZw$JtcWCRprgD+grm8KN573ujvGeu3nQILhUpkMGPnXB9I',
    'dueno'
FROM negocios n
WHERE n.nombre = 'Mesa Clara'
ON CONFLICT (username) DO UPDATE
SET password_hash = EXCLUDED.password_hash;

INSERT INTO usuarios (negocio_id, nombre, username, correo, password_hash, rol)
SELECT
    n.id,
    'Carlos Méndez',
    'carlos.mendez',
    'carlos.mendez@mesaclara.mx',
    '$argon2id$v=19$m=19456,t=2,p=1$CdM2I61pBhwr7OMjIV0mZw$JtcWCRprgD+grm8KN573ujvGeu3nQILhUpkMGPnXB9I',
    'empleado'
FROM negocios n
WHERE n.nombre = 'Mesa Clara'
ON CONFLICT (username) DO UPDATE
SET password_hash = EXCLUDED.password_hash;

INSERT INTO usuarios (negocio_id, nombre, username, correo, password_hash, rol)
SELECT
    n.id,
    'Marco Silva',
    'marco.silva',
    'marco.silva@comedorreforma.mx',
    '$argon2id$v=19$m=19456,t=2,p=1$Vfyhk9gJ3ZgDQVtHiMxvKA$EynrutyAQMl7mahnGK0/hpMLEqUVOQCj74FmilJWP8Q',
    'dueno'
FROM negocios n
WHERE n.nombre = 'Comedor Reforma'
ON CONFLICT (username) DO UPDATE
SET password_hash = EXCLUDED.password_hash;

COMMIT;
