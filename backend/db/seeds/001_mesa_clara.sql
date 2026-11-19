BEGIN;

INSERT INTO negocios (nombre)
SELECT 'Mesa Clara'
WHERE NOT EXISTS (
    SELECT 1 FROM negocios WHERE nombre = 'Mesa Clara'
);

-- Productos iniciales de Mesa Clara (solo se insertan si el negocio aún no tiene productos)
INSERT INTO productos (negocio_id, nombre, descripcion, precio_centavos, disponible)
SELECT
    n.id,
    v.nombre,
    v.descripcion,
    v.precio_centavos,
    v.disponible
FROM negocios n
CROSS JOIN (
    VALUES
        (
            'Chilaquiles Verdes',
            'Totopos crujientes bañados en salsa de tomatillo asado con crema, queso fresco y cebolla.',
            12500,
            true
        ),
        (
            'Enfrijoladas de la Casa',
            'Tortillas rellenas de pollo deshebrado en salsa cremosa de frijol negro con aguacate.',
            13800,
            true
        ),
        (
            'Hamburguesa Clásica',
            'Carne de res a la parrilla con queso manchego, lechuga, jitomate y papas gajo.',
            12000,
            true
        ),
        (
            'Pizza Pepperoni Artesanal',
            'Masa madre horneada a la piedra con salsa de jitomate rostizado, mozzarella y pepperoni.',
            18000,
            true
        ),
        (
            'Agua de Horchata Artesanal',
            'Preparada diariamente con arroz, canela de Ceilán y un toque de vainilla.',
            4500,
            true
        )
) AS v(nombre, descripcion, precio_centavos, disponible)
WHERE n.nombre = 'Mesa Clara'
  AND NOT EXISTS (
      SELECT 1 FROM productos p WHERE p.negocio_id = n.id
  );

COMMIT;
