import crypto from "node:crypto";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { obtenerNegocioConfiguradoId, obtenerTokenAsistente } from "./config.ts";
import { pool } from "./db.ts";
import {
  crearPedido,
  ErrorPedido,
  formatearPrecio,
  validarPedidoEntrada,
} from "./pedidos.ts";

/**
 * Endpoints consumidos por los Webhook Tools del Voice AI Agent de Telnyx.
 * Se autentican con `Authorization: Bearer <ASISTENTE_API_TOKEN>` en lugar de
 * la cookie de sesión del panel web. Las respuestas incluyen un campo
 * `mensaje` en español pensado para que el agente lo lea o lo use como guía.
 */

function compararSeguro(a: string, b: string): boolean {
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function verificarTokenAsistente(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const esperado = obtenerTokenAsistente();
  if (!esperado) {
    console.error(
      "ASISTENTE_API_TOKEN no está configurado o tiene menos de 16 caracteres; el asistente está deshabilitado.",
    );
    response.status(503).json({
      error: "asistente_deshabilitado",
      mensaje: "El servicio de pedidos telefónicos no está disponible en este momento.",
    });
    return;
  }

  const encabezado = request.headers.authorization ?? "";
  const [esquema, token] = encabezado.split(" ");
  if (esquema !== "Bearer" || !token || !compararSeguro(token, esperado)) {
    response.status(401).json({ error: "no_autorizado", mensaje: "Token inválido." });
    return;
  }

  next();
}

function extraerCallControlId(request: Request): string | null {
  const encabezado = request.headers["x-telnyx-call-control-id"];
  const desdeBody = request.body?.callControlId;
  const valor =
    typeof encabezado === "string" && encabezado.trim()
      ? encabezado.trim()
      : typeof desdeBody === "string" && desdeBody.trim()
        ? desdeBody.trim()
        : null;
  return valor && valor.length <= 128 ? valor : null;
}

export function crearRouterAsistente() {
  const router = Router();
  router.use(verificarTokenAsistente);

  // Tool: consultar_menu
  router.get("/menu", async (_request, response) => {
    const negocioId = obtenerNegocioConfiguradoId();
    try {
      const negocio = await pool.query(
        "SELECT id, nombre FROM negocios WHERE id = $1",
        [negocioId],
      );
      if (negocio.rows.length === 0) {
        console.error(`DEMO_NEGOCIO_ID=${negocioId} no existe en la tabla negocios.`);
        response.status(500).json({
          error: "negocio_no_configurado",
          mensaje: "No se pudo consultar el menú en este momento.",
        });
        return;
      }

      const { rows } = await pool.query(
        `SELECT id, nombre, descripcion, precio_centavos AS "precioCentavos"
         FROM productos
         WHERE negocio_id = $1 AND disponible = true
         ORDER BY id`,
        [negocioId],
      );

      const productos = rows.map((fila) => ({
        id: Number(fila.id),
        nombre: String(fila.nombre),
        descripcion: String(fila.descripcion),
        precio: formatearPrecio(Number(fila.precioCentavos)),
        precioCentavos: Number(fila.precioCentavos),
      }));

      response.json({
        negocio: String(negocio.rows[0].nombre),
        productos,
        mensaje:
          productos.length > 0
            ? `Hay ${productos.length} productos disponibles. Usa el campo id de cada producto al crear el pedido.`
            : "Por ahora no hay productos disponibles. Discúlpate con el cliente.",
      });
    } catch (error) {
      console.error("Error al consultar menú para el asistente:", error);
      response.status(500).json({
        error: "error_interno",
        mensaje: "No se pudo consultar el menú en este momento.",
      });
    }
  });

  // Tool: crear_pedido
  router.post("/pedidos", async (request, response) => {
    const validacion = validarPedidoEntrada(request.body);
    if (!validacion.ok) {
      response.status(400).json({ error: "datos_invalidos", mensaje: validacion.mensaje });
      return;
    }

    try {
      const { pedido, duplicado } = await crearPedido(
        obtenerNegocioConfiguradoId(),
        validacion.pedido,
        { origen: "telefono_ia", callControlId: extraerCallControlId(request) },
      );

      const total = formatearPrecio(pedido.totalCentavos);
      response.status(duplicado ? 200 : 201).json({
        pedidoId: pedido.id,
        estado: pedido.estado,
        duplicado,
        total,
        totalCentavos: pedido.totalCentavos,
        tipoEntrega: pedido.tipoEntrega,
        items: pedido.items.map((item) => ({
          nombre: item.nombre,
          cantidad: item.cantidad,
          subtotal: formatearPrecio(item.precioUnitarioCentavos * item.cantidad),
        })),
        mensaje: duplicado
          ? `Este pedido ya estaba registrado con el número ${pedido.id}. Total: ${total}.`
          : `Pedido número ${pedido.id} registrado a nombre de ${pedido.clienteNombre}. Total: ${total}.`,
      });
    } catch (error) {
      if (error instanceof ErrorPedido) {
        response.status(error.status).json({
          error: error.codigo,
          mensaje: error.message,
          ...error.detalle,
        });
        return;
      }
      console.error("Error al crear pedido desde el asistente:", error);
      response.status(500).json({
        error: "error_interno",
        mensaje: "No se pudo registrar el pedido. Pide al cliente que intente más tarde.",
      });
    }
  });

  return router;
}
