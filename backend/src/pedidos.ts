import { Router } from "express";
import type { Request } from "express";
import type { UsuarioSesion } from "./auth.ts";
import { pool } from "./db.ts";

export const ESTADOS_PEDIDO = [
  "pendiente",
  "en_preparacion",
  "listo",
  "entregado",
  "cancelado",
] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];

export const TIPOS_ENTREGA = ["recoger", "domicilio"] as const;
export type TipoEntrega = (typeof TIPOS_ENTREGA)[number];

export type OrigenPedido = "telefono_ia" | "manual";

const TRANSICIONES: Record<EstadoPedido, readonly EstadoPedido[]> = {
  pendiente: ["en_preparacion", "cancelado"],
  en_preparacion: ["listo", "cancelado"],
  listo: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

const MAX_ENTERO_PG = 2_147_483_647;
const MAX_ITEMS_POR_PEDIDO = 30;
const MAX_CANTIDAD_POR_ITEM = 50;

export function esEstadoPedido(valor: unknown): valor is EstadoPedido {
  return (
    typeof valor === "string" &&
    (ESTADOS_PEDIDO as readonly string[]).includes(valor)
  );
}

export function puedeTransicionar(
  actual: EstadoPedido,
  nuevo: EstadoPedido,
): boolean {
  return TRANSICIONES[actual].includes(nuevo);
}

export function formatearPrecio(centavos: number): string {
  return `${(centavos / 100).toFixed(2)} MXN`;
}

// ---------------------------------------------------------------------------
// Validación de la entrada
// ---------------------------------------------------------------------------

export type ItemPedidoEntrada = {
  productoId: number;
  cantidad: number;
  notas: string | null;
};

export type PedidoEntrada = {
  clienteNombre: string;
  clienteTelefono: string | null;
  tipoEntrega: TipoEntrega;
  direccionEntrega: string | null;
  notas: string | null;
  items: ItemPedidoEntrada[];
};

type ResultadoValidacion =
  | { ok: true; pedido: PedidoEntrada }
  | { ok: false; mensaje: string };

function textoOpcional(
  valor: unknown,
  maximo: number,
): { ok: true; valor: string | null } | { ok: false } {
  if (valor === undefined || valor === null) return { ok: true, valor: null };
  if (typeof valor !== "string") return { ok: false };
  const limpio = valor.trim();
  if (limpio.length > maximo) return { ok: false };
  return { ok: true, valor: limpio.length > 0 ? limpio : null };
}

export function normalizarTelefono(valor: string): string | null {
  const limpio = valor.replace(/[\s\-().]/g, "");
  return /^\+?\d{7,15}$/.test(limpio) ? limpio : null;
}

export function validarPedidoEntrada(body: unknown): ResultadoValidacion {
  if (typeof body !== "object" || body === null) {
    return { ok: false, mensaje: "El cuerpo de la petición debe ser un objeto JSON." };
  }
  const datos = body as Record<string, unknown>;

  const clienteNombre =
    typeof datos.clienteNombre === "string" ? datos.clienteNombre.trim() : "";
  if (!clienteNombre || clienteNombre.length > 120) {
    return { ok: false, mensaje: "El nombre del cliente debe tener entre 1 y 120 caracteres." };
  }

  let clienteTelefono: string | null = null;
  if (datos.clienteTelefono !== undefined && datos.clienteTelefono !== null && datos.clienteTelefono !== "") {
    if (typeof datos.clienteTelefono !== "string") {
      return { ok: false, mensaje: "El teléfono del cliente no es válido." };
    }
    clienteTelefono = normalizarTelefono(datos.clienteTelefono);
    if (!clienteTelefono) {
      return { ok: false, mensaje: "El teléfono del cliente debe tener entre 7 y 15 dígitos." };
    }
  }

  const tipoEntrega = datos.tipoEntrega ?? "recoger";
  if (!(TIPOS_ENTREGA as readonly unknown[]).includes(tipoEntrega)) {
    return { ok: false, mensaje: "El tipo de entrega debe ser 'recoger' o 'domicilio'." };
  }

  const direccion = textoOpcional(datos.direccionEntrega, 250);
  if (!direccion.ok) {
    return { ok: false, mensaje: "La dirección de entrega debe tener como máximo 250 caracteres." };
  }
  if (tipoEntrega === "domicilio" && !direccion.valor) {
    return { ok: false, mensaje: "Para entrega a domicilio se requiere la dirección." };
  }

  const notas = textoOpcional(datos.notas, 500);
  if (!notas.ok) {
    return { ok: false, mensaje: "Las notas del pedido deben tener como máximo 500 caracteres." };
  }

  if (
    !Array.isArray(datos.items) ||
    datos.items.length === 0 ||
    datos.items.length > MAX_ITEMS_POR_PEDIDO
  ) {
    return {
      ok: false,
      mensaje: `El pedido debe incluir entre 1 y ${MAX_ITEMS_POR_PEDIDO} productos.`,
    };
  }

  const items: ItemPedidoEntrada[] = [];
  for (const [indice, crudo] of datos.items.entries()) {
    const posicion = indice + 1;
    if (typeof crudo !== "object" || crudo === null) {
      return { ok: false, mensaje: `El producto ${posicion} no es válido.` };
    }
    const item = crudo as Record<string, unknown>;
    const productoId = item.productoId;
    if (
      typeof productoId !== "number" ||
      !Number.isInteger(productoId) ||
      productoId < 1 ||
      productoId > MAX_ENTERO_PG
    ) {
      return { ok: false, mensaje: `El producto ${posicion} tiene un productoId inválido.` };
    }
    const cantidad = item.cantidad;
    if (
      typeof cantidad !== "number" ||
      !Number.isInteger(cantidad) ||
      cantidad < 1 ||
      cantidad > MAX_CANTIDAD_POR_ITEM
    ) {
      return {
        ok: false,
        mensaje: `La cantidad del producto ${posicion} debe ser un entero entre 1 y ${MAX_CANTIDAD_POR_ITEM}.`,
      };
    }
    const notasItem = textoOpcional(item.notas, 250);
    if (!notasItem.ok) {
      return { ok: false, mensaje: `Las notas del producto ${posicion} deben tener como máximo 250 caracteres.` };
    }
    items.push({ productoId, cantidad, notas: notasItem.valor });
  }

  return {
    ok: true,
    pedido: {
      clienteNombre,
      clienteTelefono,
      tipoEntrega: tipoEntrega as TipoEntrega,
      direccionEntrega: tipoEntrega === "domicilio" ? direccion.valor : null,
      notas: notas.valor,
      items,
    },
  };
}

// ---------------------------------------------------------------------------
// Acceso a datos
// ---------------------------------------------------------------------------

export type ItemPedido = {
  id: number;
  productoId: number | null;
  nombre: string;
  cantidad: number;
  precioUnitarioCentavos: number;
  notas: string | null;
};

export type Pedido = {
  id: number;
  clienteNombre: string;
  clienteTelefono: string | null;
  tipoEntrega: TipoEntrega;
  direccionEntrega: string | null;
  estado: EstadoPedido;
  totalCentavos: number;
  notas: string | null;
  origen: OrigenPedido;
  creadoEn: string;
  actualizadoEn: string;
  items: ItemPedido[];
};

type Consultor = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

export class ErrorPedido extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly detalle: Record<string, unknown>;

  constructor(
    status: number,
    codigo: string,
    mensaje: string,
    detalle: Record<string, unknown> = {},
  ) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

const SELECT_PEDIDOS = `
  SELECT p.id,
         p.cliente_nombre AS "clienteNombre",
         p.cliente_telefono AS "clienteTelefono",
         p.tipo_entrega AS "tipoEntrega",
         p.direccion_entrega AS "direccionEntrega",
         p.estado,
         p.total_centavos AS "totalCentavos",
         p.notas,
         p.origen,
         p.creado_en AS "creadoEn",
         p.actualizado_en AS "actualizadoEn",
         COALESCE(
           json_agg(
             json_build_object(
               'id', i.id,
               'productoId', i.producto_id,
               'nombre', i.nombre_producto,
               'cantidad', i.cantidad,
               'precioUnitarioCentavos', i.precio_unitario_centavos,
               'notas', i.notas
             ) ORDER BY i.id
           ) FILTER (WHERE i.id IS NOT NULL),
           '[]'::json
         ) AS items
  FROM pedidos p
  LEFT JOIN pedido_items i ON i.pedido_id = p.id`;

function mapearPedido(fila: Record<string, unknown>): Pedido {
  const fecha = (valor: unknown) =>
    valor instanceof Date ? valor.toISOString() : String(valor);
  return {
    id: Number(fila.id),
    clienteNombre: String(fila.clienteNombre),
    clienteTelefono: (fila.clienteTelefono as string | null) ?? null,
    tipoEntrega: fila.tipoEntrega as TipoEntrega,
    direccionEntrega: (fila.direccionEntrega as string | null) ?? null,
    estado: fila.estado as EstadoPedido,
    totalCentavos: Number(fila.totalCentavos),
    notas: (fila.notas as string | null) ?? null,
    origen: fila.origen as OrigenPedido,
    creadoEn: fecha(fila.creadoEn),
    actualizadoEn: fecha(fila.actualizadoEn),
    items: (fila.items as ItemPedido[]) ?? [],
  };
}

export async function listarPedidos(
  negocioId: number,
  estados: EstadoPedido[] | null,
  limite: number,
): Promise<Pedido[]> {
  const { rows } = await pool.query(
    `${SELECT_PEDIDOS}
     WHERE p.negocio_id = $1
       AND ($2::text[] IS NULL OR p.estado = ANY($2::text[]))
     GROUP BY p.id
     ORDER BY p.creado_en DESC
     LIMIT $3`,
    [negocioId, estados, limite],
  );
  return rows.map(mapearPedido);
}

async function buscarPedidoPorCallControl(
  consultor: Consultor,
  negocioId: number,
  callControlId: string,
): Promise<Pedido | null> {
  const { rows } = await consultor.query(
    `${SELECT_PEDIDOS}
     WHERE p.negocio_id = $1 AND p.call_control_id = $2
     GROUP BY p.id`,
    [negocioId, callControlId],
  );
  return rows.length > 0 ? mapearPedido(rows[0]) : null;
}

function esViolacionUnicaCallControl(error: unknown): boolean {
  const e = error as { code?: string; constraint?: string };
  return e?.code === "23505" && e?.constraint === "pedidos_call_control_id_key";
}

export type ResultadoCrearPedido = { pedido: Pedido; duplicado: boolean };

/**
 * Registra un pedido dentro de una transacción. Los precios y la
 * disponibilidad siempre se toman de PostgreSQL; nunca del cliente o del LLM.
 */
export async function crearPedido(
  negocioId: number,
  entrada: PedidoEntrada,
  opciones: { origen: OrigenPedido; callControlId: string | null },
): Promise<ResultadoCrearPedido> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (opciones.callControlId) {
      const existente = await buscarPedidoPorCallControl(
        client,
        negocioId,
        opciones.callControlId,
      );
      if (existente) {
        await client.query("COMMIT");
        return { pedido: existente, duplicado: true };
      }
    }

    const idsSolicitados = [...new Set(entrada.items.map((i) => i.productoId))];
    const { rows: filasProductos } = await client.query(
      `SELECT id, nombre, precio_centavos AS "precioCentavos", disponible
       FROM productos
       WHERE negocio_id = $1 AND id = ANY($2::int[])
       FOR SHARE`,
      [negocioId, idsSolicitados],
    );

    const productos = new Map<
      number,
      { nombre: string; precioCentavos: number; disponible: boolean }
    >(
      filasProductos.map((fila) => [
        Number(fila.id),
        {
          nombre: String(fila.nombre),
          precioCentavos: Number(fila.precioCentavos),
          disponible: Boolean(fila.disponible),
        },
      ]),
    );

    const noEncontrados = idsSolicitados.filter((id) => !productos.has(id));
    if (noEncontrados.length > 0) {
      throw new ErrorPedido(
        422,
        "producto_no_encontrado",
        `Estos productos no existen en el menú: ${noEncontrados.join(", ")}. Consulta el menú de nuevo.`,
        { productoIds: noEncontrados },
      );
    }

    const agotados = idsSolicitados.filter((id) => !productos.get(id)!.disponible);
    if (agotados.length > 0) {
      const nombres = agotados.map((id) => productos.get(id)!.nombre);
      throw new ErrorPedido(
        409,
        "producto_agotado",
        `Estos productos están agotados: ${nombres.join(", ")}. Ofrece al cliente otra opción del menú.`,
        { productoIds: agotados, productos: nombres },
      );
    }

    const lineas = entrada.items.map((item) => {
      const producto = productos.get(item.productoId)!;
      return {
        ...item,
        nombre: producto.nombre,
        precioUnitarioCentavos: producto.precioCentavos,
      };
    });

    const totalCentavos = lineas.reduce(
      (suma, linea) => suma + linea.precioUnitarioCentavos * linea.cantidad,
      0,
    );
    if (totalCentavos > MAX_ENTERO_PG) {
      throw new ErrorPedido(422, "total_excedido", "El total del pedido es demasiado alto.");
    }

    const { rows: filasPedido } = await client.query(
      `INSERT INTO pedidos (negocio_id, cliente_nombre, cliente_telefono, tipo_entrega,
                            direccion_entrega, total_centavos, notas, origen, call_control_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, estado, creado_en AS "creadoEn", actualizado_en AS "actualizadoEn"`,
      [
        negocioId,
        entrada.clienteNombre,
        entrada.clienteTelefono,
        entrada.tipoEntrega,
        entrada.direccionEntrega,
        totalCentavos,
        entrada.notas,
        opciones.origen,
        opciones.callControlId,
      ],
    );
    const creado = filasPedido[0];

    const items: ItemPedido[] = [];
    for (const linea of lineas) {
      const { rows } = await client.query(
        `INSERT INTO pedido_items (pedido_id, producto_id, nombre_producto, cantidad,
                                   precio_unitario_centavos, notas)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          creado.id,
          linea.productoId,
          linea.nombre,
          linea.cantidad,
          linea.precioUnitarioCentavos,
          linea.notas,
        ],
      );
      items.push({
        id: Number(rows[0].id),
        productoId: linea.productoId,
        nombre: linea.nombre,
        cantidad: linea.cantidad,
        precioUnitarioCentavos: linea.precioUnitarioCentavos,
        notas: linea.notas,
      });
    }

    await client.query("COMMIT");

    return {
      duplicado: false,
      pedido: mapearPedido({
        ...creado,
        clienteNombre: entrada.clienteNombre,
        clienteTelefono: entrada.clienteTelefono,
        tipoEntrega: entrada.tipoEntrega,
        direccionEntrega: entrada.direccionEntrega,
        totalCentavos,
        notas: entrada.notas,
        origen: opciones.origen,
        items,
      }),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);

    // Dos reintentos simultáneos de Telnyx para la misma llamada.
    if (opciones.callControlId && esViolacionUnicaCallControl(error)) {
      const existente = await buscarPedidoPorCallControl(
        pool,
        negocioId,
        opciones.callControlId,
      );
      if (existente) return { pedido: existente, duplicado: true };
    }
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Rutas para el personal del restaurante (requieren sesión)
// ---------------------------------------------------------------------------

type ObtenerSesion = (request: Request) => Promise<UsuarioSesion | null>;

export function crearRouterPedidos(obtenerSesion: ObtenerSesion) {
  const router = Router();

  router.use(async (request, response, next) => {
    try {
      const sesion = await obtenerSesion(request);
      if (!sesion) {
        response.status(401).json({ message: "Inicia sesión para continuar" });
        return;
      }
      response.locals.sesion = sesion;
      next();
    } catch (error) {
      console.error("Error al verificar sesión:", error);
      response.status(500).json({ message: "No se pudo verificar la sesión" });
    }
  });

  // GET /api/pedidos?estado=pendiente,en_preparacion&limite=50
  router.get("/", async (request, response) => {
    const sesion = response.locals.sesion as UsuarioSesion;

    let estados: EstadoPedido[] | null = null;
    if (typeof request.query.estado === "string" && request.query.estado.trim()) {
      const solicitados = request.query.estado.split(",").map((e) => e.trim());
      if (!solicitados.every(esEstadoPedido)) {
        response.status(400).json({
          message: `Estado inválido. Valores permitidos: ${ESTADOS_PEDIDO.join(", ")}`,
        });
        return;
      }
      estados = solicitados as EstadoPedido[];
    }

    let limite = 50;
    if (request.query.limite !== undefined) {
      limite = Number(request.query.limite);
      if (!Number.isInteger(limite) || limite < 1 || limite > 200) {
        response.status(400).json({ message: "El límite debe ser un entero entre 1 y 200" });
        return;
      }
    }

    try {
      response.json(await listarPedidos(sesion.negocio.id, estados, limite));
    } catch (error) {
      console.error("Error al listar pedidos:", error);
      response.status(500).json({ message: "No se pudieron listar los pedidos" });
    }
  });

  // POST /api/pedidos — captura manual por parte del personal
  router.post("/", async (request, response) => {
    const sesion = response.locals.sesion as UsuarioSesion;
    const validacion = validarPedidoEntrada(request.body);
    if (!validacion.ok) {
      response.status(400).json({ message: validacion.mensaje });
      return;
    }

    try {
      const { pedido } = await crearPedido(sesion.negocio.id, validacion.pedido, {
        origen: "manual",
        callControlId: null,
      });
      response.status(201).json(pedido);
    } catch (error) {
      if (error instanceof ErrorPedido) {
        response.status(error.status).json({ message: error.message, ...error.detalle });
        return;
      }
      console.error("Error al crear pedido manual:", error);
      response.status(500).json({ message: "No se pudo crear el pedido" });
    }
  });

  // PATCH /api/pedidos/:id  { "estado": "en_preparacion" }
  router.patch("/:id", async (request, response) => {
    const sesion = response.locals.sesion as UsuarioSesion;
    const pedidoId = Number(request.params.id);
    if (!Number.isInteger(pedidoId) || pedidoId < 1 || pedidoId > MAX_ENTERO_PG) {
      response.status(400).json({ message: "ID de pedido inválido" });
      return;
    }

    const nuevoEstado = request.body?.estado;
    if (!esEstadoPedido(nuevoEstado)) {
      response.status(400).json({
        message: `Estado inválido. Valores permitidos: ${ESTADOS_PEDIDO.join(", ")}`,
      });
      return;
    }

    try {
      const actual = await pool.query(
        "SELECT estado FROM pedidos WHERE id = $1 AND negocio_id = $2",
        [pedidoId, sesion.negocio.id],
      );
      if (actual.rows.length === 0) {
        response.status(404).json({ message: "Pedido no encontrado" });
        return;
      }

      const estadoActual = actual.rows[0].estado as EstadoPedido;
      if (!puedeTransicionar(estadoActual, nuevoEstado)) {
        response.status(409).json({
          message: `No se puede cambiar un pedido de '${estadoActual}' a '${nuevoEstado}'.`,
        });
        return;
      }

      // La condición sobre el estado actual evita pisar un cambio concurrente.
      const { rows } = await pool.query(
        `UPDATE pedidos
         SET estado = $3, actualizado_en = now()
         WHERE id = $1 AND negocio_id = $2 AND estado = $4
         RETURNING id, estado, actualizado_en AS "actualizadoEn"`,
        [pedidoId, sesion.negocio.id, nuevoEstado, estadoActual],
      );
      if (rows.length === 0) {
        response.status(409).json({
          message: "El pedido fue modificado por otra persona. Recarga la lista.",
        });
        return;
      }

      response.json(rows[0]);
    } catch (error) {
      console.error("Error al actualizar pedido:", error);
      response.status(500).json({ message: "No se pudo actualizar el pedido" });
    }
  });

  return router;
}
