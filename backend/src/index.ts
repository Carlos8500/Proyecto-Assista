import express from "express";
import { pool } from "./db";

const app = express();
const port = 3000;

app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({ message: "Backend de Assista conectado" });
});

app.get("/api/negocio", async (_request, response) => {
  const negocioId = Number(process.env.DEMO_NEGOCIO_ID);

  if (!Number.isInteger(negocioId) || negocioId < 1) {
    response.status(500).json({ message: "Configura DEMO_NEGOCIO_ID" });
    return;
  }

  try {
    const { rows } = await pool.query(
      "SELECT id, nombre FROM negocios WHERE id = $1",
      [negocioId],
    );

    if (rows.length === 0) {
      response.status(404).json({ message: "Negocio de prueba no encontrado" });
      return;
    }

    response.json(rows[0]);
  } catch (error) {
    console.error("Error al consultar el negocio:", error);
    response.status(500).json({ message: "No se pudo consultar el negocio" });
  }
});

app.get("/api/productos", async (_request, response) => {
  const negocioId = Number(process.env.DEMO_NEGOCIO_ID);

  if (!Number.isInteger(negocioId) || negocioId < 1) {
    response.status(500).json({ message: "Configura DEMO_NEGOCIO_ID" });
    return;
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, nombre, descripcion,
              precio_centavos AS "precioCentavos", disponible
       FROM productos
       WHERE negocio_id = $1
       ORDER BY id`,
      [negocioId],
    );

    response.json(rows);
  } catch (error) {
    console.error("Error al listar productos:", error);
    response.status(500).json({ message: "No se pudieron listar los productos" });
  }
});

app.post("/api/productos", async (request, response) => {
  const negocioId = Number(process.env.DEMO_NEGOCIO_ID);

  if (!Number.isInteger(negocioId) || negocioId < 1) {
    response.status(500).json({ message: "Configura DEMO_NEGOCIO_ID" });
    return;
  }

  const { nombre, descripcion, precioCentavos } = request.body ?? {};
  const nombreLimpio = typeof nombre === "string" ? nombre.trim() : "";
  const descripcionLimpia =
    typeof descripcion === "string" ? descripcion.trim() : "";

  if (!nombreLimpio || nombreLimpio.length > 120) {
    response.status(400).json({
      message: "El nombre debe tener entre 1 y 120 caracteres",
    });
    return;
  }

  if (!descripcionLimpia || descripcionLimpia.length > 250) {
    response.status(400).json({
      message: "La descripción debe tener entre 1 y 250 caracteres",
    });
    return;
  }

  if (
    typeof precioCentavos !== "number" ||
    !Number.isInteger(precioCentavos) ||
    precioCentavos < 1 ||
    precioCentavos > 2_147_483_647
  ) {
    response.status(400).json({
      message: "El precio debe ser un entero positivo válido en centavos",
    });
    return;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO productos (negocio_id, nombre, descripcion, precio_centavos)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, descripcion,
                 precio_centavos AS "precioCentavos", disponible`,
      [negocioId, nombreLimpio, descripcionLimpia, precioCentavos],
    );

    response.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error al crear el producto:", error);
    response.status(500).json({ message: "No se pudo crear el producto" });
  }
});

app.patch("/api/productos/:id", async (request, response) => {
  const negocioId = Number(process.env.DEMO_NEGOCIO_ID);
  const productoId = Number(request.params.id);

  if (!Number.isInteger(negocioId) || negocioId < 1) {
    response.status(500).json({ message: "Configura DEMO_NEGOCIO_ID" });
    return;
  }

  if (!Number.isInteger(productoId) || productoId < 1 || productoId > 2_147_483_647) {
    response.status(400).json({ message: "ID de producto inválido" });
    return;
  }

  const { nombre, descripcion, precioCentavos, disponible } = request.body ?? {};

  if ([nombre, descripcion, precioCentavos, disponible].every((valor) => valor === undefined)) {
    response.status(400).json({ message: "Envía al menos un campo para actualizar" });
    return;
  }

  if (
    nombre !== undefined &&
    (typeof nombre !== "string" || !nombre.trim() || nombre.trim().length > 120)
  ) {
    response.status(400).json({ message: "El nombre debe tener entre 1 y 120 caracteres" });
    return;
  }

  if (
    descripcion !== undefined &&
    (typeof descripcion !== "string" || !descripcion.trim() || descripcion.trim().length > 250)
  ) {
    response.status(400).json({ message: "La descripción debe tener entre 1 y 250 caracteres" });
    return;
  }

  if (
    precioCentavos !== undefined &&
    (typeof precioCentavos !== "number" ||
      !Number.isInteger(precioCentavos) ||
      precioCentavos < 1 ||
      precioCentavos > 2_147_483_647)
  ) {
    response.status(400).json({ message: "El precio debe ser un entero positivo válido en centavos" });
    return;
  }

  if (disponible !== undefined && typeof disponible !== "boolean") {
    response.status(400).json({ message: "La disponibilidad debe ser true o false" });
    return;
  }

  try {
    const { rows } = await pool.query(
      `UPDATE productos
       SET nombre = COALESCE($3, nombre),
           descripcion = COALESCE($4, descripcion),
           precio_centavos = COALESCE($5, precio_centavos),
           disponible = COALESCE($6, disponible)
       WHERE id = $1 AND negocio_id = $2
       RETURNING id, nombre, descripcion,
                 precio_centavos AS "precioCentavos", disponible`,
      [
        productoId,
        negocioId,
        nombre?.trim() ?? null,
        descripcion?.trim() ?? null,
        precioCentavos ?? null,
        disponible ?? null,
      ],
    );

    if (rows.length === 0) {
      response.status(404).json({ message: "Producto no encontrado" });
      return;
    }

    response.json(rows[0]);
  } catch (error) {
    console.error("Error al actualizar el producto:", error);
    response.status(500).json({ message: "No se pudo actualizar el producto" });
  }
});

app.listen(port, () => {
  console.log(`API de Assista en http://localhost:${port}`);
});
