BEGIN;

CREATE TABLE negocios (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre varchar(120) NOT NULL CHECK (btrim(nombre) <> '')
);

CREATE TABLE productos (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    negocio_id integer NOT NULL REFERENCES negocios(id),
    nombre varchar(120) NOT NULL CHECK (btrim(nombre) <> ''),
    descripcion varchar(250) NOT NULL CHECK (btrim(descripcion) <> ''),
    precio_centavos integer NOT NULL CHECK (precio_centavos > 0),
    disponible boolean NOT NULL DEFAULT true
);

CREATE INDEX productos_negocio_id_idx ON productos (negocio_id);

COMMIT;
