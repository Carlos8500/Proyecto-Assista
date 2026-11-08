BEGIN;

CREATE TABLE usuarios (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    negocio_id integer NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
    nombre varchar(120) NOT NULL CHECK (btrim(nombre) <> ''),
    username varchar(60) NOT NULL UNIQUE CHECK (btrim(username) <> ''),
    correo varchar(160) NOT NULL UNIQUE CHECK (btrim(correo) <> ''),
    password_hash text NOT NULL CHECK (btrim(password_hash) <> ''),
    rol varchar(20) NOT NULL CHECK (rol IN ('dueno', 'empleado')),
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX usuarios_negocio_id_idx ON usuarios (negocio_id);

CREATE TABLE sesiones (
    token varchar(128) PRIMARY KEY,
    usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expira_en timestamptz NOT NULL,
    creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sesiones_usuario_id_idx ON sesiones (usuario_id);
CREATE INDEX sesiones_expira_en_idx ON sesiones (expira_en);

COMMIT;
