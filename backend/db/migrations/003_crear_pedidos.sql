BEGIN;

CREATE TABLE pedidos (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    negocio_id integer NOT NULL REFERENCES negocios(id),
    cliente_nombre varchar(120) NOT NULL CHECK (btrim(cliente_nombre) <> ''),
    cliente_telefono varchar(20),
    tipo_entrega varchar(20) NOT NULL DEFAULT 'recoger'
        CHECK (tipo_entrega IN ('recoger', 'domicilio')),
    direccion_entrega varchar(250),
    estado varchar(20) NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelado')),
    total_centavos integer NOT NULL CHECK (total_centavos > 0),
    notas varchar(500),
    origen varchar(20) NOT NULL DEFAULT 'telefono_ia'
        CHECK (origen IN ('telefono_ia', 'manual')),
    -- Identificador de la llamada en Telnyx. Evita pedidos duplicados si
    -- Telnyx reintenta la petición del Webhook Tool.
    call_control_id varchar(128) UNIQUE,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pedidos_direccion_domicilio_chk CHECK (
        tipo_entrega <> 'domicilio'
        OR (direccion_entrega IS NOT NULL AND btrim(direccion_entrega) <> '')
    )
);

CREATE INDEX pedidos_negocio_estado_idx
    ON pedidos (negocio_id, estado, creado_en DESC);

CREATE TABLE pedido_items (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido_id integer NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    -- Si el producto se elimina del menú, el pedido conserva el nombre y precio.
    producto_id integer REFERENCES productos(id) ON DELETE SET NULL,
    nombre_producto varchar(120) NOT NULL CHECK (btrim(nombre_producto) <> ''),
    cantidad integer NOT NULL CHECK (cantidad BETWEEN 1 AND 50),
    precio_unitario_centavos integer NOT NULL CHECK (precio_unitario_centavos > 0),
    notas varchar(250)
);

CREATE INDEX pedido_items_pedido_id_idx ON pedido_items (pedido_id);

COMMIT;
