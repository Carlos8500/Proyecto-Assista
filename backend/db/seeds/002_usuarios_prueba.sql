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
    '$argon2id$v=19$m=19456,t=2,p=1$Y2xhcmFzYWx0MjAyNg$7rV8pG9mK2xL4qW1nZ5vB3cT6yH0jF8dR2sA4eU7iO9',
    'dueno'
FROM negocios n
WHERE n.nombre = 'Mesa Clara'
  AND NOT EXISTS (
      SELECT 1 FROM usuarios WHERE username = 'lucia.garcia'
  );

INSERT INTO usuarios (negocio_id, nombre, username, correo, password_hash, rol)
SELECT
    n.id,
    'Carlos Méndez',
    'carlos.mendez',
    'carlos.mendez@mesaclara.mx',
    '$argon2id$v=19$m=19456,t=2,p=1$Y2xhcmFzYWx0MjAyNg$7rV8pG9mK2xL4qW1nZ5vB3cT6yH0jF8dR2sA4eU7iO9',
    'empleado'
FROM negocios n
WHERE n.nombre = 'Mesa Clara'
  AND NOT EXISTS (
      SELECT 1 FROM usuarios WHERE username = 'carlos.mendez'
  );

INSERT INTO usuarios (negocio_id, nombre, username, correo, password_hash, rol)
SELECT
    n.id,
    'Marco Silva',
    'marco.silva',
    'marco.silva@comedorreforma.mx',
    '$argon2id$v=19$m=19456,t=2,p=1$cmVmb3JtYXNhbHQyMDI2$3kL9mN2pQ5rS8tV1wX4yZ7aB0cD6eF9gH2jK5lM8nP1',
    'dueno'
FROM negocios n
WHERE n.nombre = 'Comedor Reforma'
  AND NOT EXISTS (
      SELECT 1 FROM usuarios WHERE username = 'marco.silva'
  );

COMMIT;
