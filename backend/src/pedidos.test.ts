import test from "node:test";
import assert from "node:assert/strict";
import type { PoolClient, QueryResult } from "pg";
import { pool } from "./db.ts";
import {
  formatearPrecio,
  normalizarTelefono,
  puedeTransicionar,
  validarPedidoEntrada,
} from "./pedidos.ts";
import type { EstadoPedido, OrigenPedido, TipoEntrega } from "./pedidos.ts";
import {
  alawAPcm16,
  construirWavPcm16,
  DetectorTurnoVoz,
  mulawAPcm16,
  rmsPcm16,
} from "./telefonia.ts";
import { requestApp } from "./test-helpers.ts";

process.env.NODE_ENV = "test";
process.env.DEMO_NEGOCIO_ID = "1";

const TOKEN_PRUEBA = "telnyx_secret_token_2026_mesa_clara";

test("Validadores de pedido, teléfono, precios y transiciones de estado", () => {
  assert.equal(formatearPrecio(12500), "125.00 MXN");
  assert.equal(normalizarTelefono("+52 (55) 1234-5678"), "+525512345678");
  assert.equal(normalizarTelefono("abc"), null);

  assert.equal(puedeTransicionar("pendiente", "en_preparacion"), true);
  assert.equal(puedeTransicionar("pendiente", "entregado"), false);
  assert.equal(puedeTransicionar("entregado", "cancelado"), false);

  const sinDireccionDomicilio = validarPedidoEntrada({
    clienteNombre: "Juan Pérez",
    tipoEntrega: "domicilio",
    items: [{ productoId: 1, cantidad: 2 }],
  });
  assert.equal(sinDireccionDomicilio.ok, false);

  const valido = validarPedidoEntrada({
    clienteNombre: "Juan Pérez",
    clienteTelefono: "55 1234 5678",
    tipoEntrega: "domicilio",
    direccionEntrega: "Av. Reforma 120, Col. Juárez",
    notas: "Sin cebolla",
    items: [{ productoId: 1, cantidad: 2, notas: "Salsa aparte" }],
  });
  assert.equal(valido.ok, true);
  if (valido.ok) {
    assert.equal(valido.pedido.clienteTelefono, "5512345678");
    assert.equal(valido.pedido.tipoEntrega, "domicilio");
    assert.equal(valido.pedido.items[0].cantidad, 2);
  }
});

test("Flujo completo de pedidos: Webhook Tools de Telnyx (/api/asistente/*) y panel del personal (/api/pedidos)", async (t) => {
  const { app } = await import("./index.ts");

  const negocios = [{ id: 1, nombre: "Mesa Clara" }];
  const productos = [
    {
      id: 1,
      negocio_id: 1,
      nombre: "Chilaquiles Verdes",
      descripcion: "Totopos con salsa de tomatillo, crema y queso.",
      precio_centavos: 12500,
      disponible: true,
    },
    {
      id: 2,
      negocio_id: 1,
      nombre: "Agua de Horchata",
      descripcion: "Preparada con arroz y canela.",
      precio_centavos: 4500,
      disponible: true,
    },
    {
      id: 3,
      negocio_id: 1,
      nombre: "Tamal Oaxaqueño",
      descripcion: "Tamal en hoja de plátano.",
      precio_centavos: 6000,
      disponible: false,
    },
  ];

  const pedidosStore: {
    id: number;
    negocio_id: number;
    cliente_nombre: string;
    cliente_telefono: string | null;
    tipo_entrega: TipoEntrega;
    direccion_entrega: string | null;
    estado: EstadoPedido;
    total_centavos: number;
    notas: string | null;
    origen: OrigenPedido;
    call_control_id: string | null;
    creado_en: Date;
    actualizado_en: Date;
  }[] = [];
  let nextPedidoId = 1;

  const pedidoItemsStore: {
    id: number;
    pedido_id: number;
    producto_id: number | null;
    nombre_producto: string;
    cantidad: number;
    precio_unitario_centavos: number;
    notas: string | null;
  }[] = [];
  let nextItemId = 1;

  const ejecutarSql = async (
    sqlText: string,
    params: unknown[] = [],
  ): Promise<QueryResult> => {
    const normalized = sqlText.replace(/\s+/g, " ").trim().toUpperCase();
    const asResult = (rows: Record<string, unknown>[]) =>
      ({ rows }) as unknown as QueryResult;

    if (
      normalized === "BEGIN" ||
      normalized === "COMMIT" ||
      normalized === "ROLLBACK"
    ) {
      return asResult([]);
    }

    if (
      normalized.includes("FROM SESIONES S") &&
      normalized.includes("JOIN USUARIOS U")
    ) {
      const token = String(params[0] ?? "");
      if (token === "token_empleado_valido") {
        return asResult([
          {
            id: 2,
            nombre: "Carlos Méndez",
            username: "carlos.mendez",
            correo: "carlos.mendez@mesaclara.mx",
            rol: "empleado",
            negocioId: 1,
            negocioNombre: "Mesa Clara",
          },
        ]);
      }
      return asResult([]);
    }

    if (normalized.startsWith("SELECT ID, NOMBRE FROM NEGOCIOS")) {
      const id = Number(params[0]);
      return asResult(negocios.filter((n) => n.id === id));
    }

    if (
      normalized.includes("FROM PRODUCTOS") &&
      normalized.includes("DISPONIBLE = TRUE")
    ) {
      const negocioId = Number(params[0]);
      return asResult(
        productos
          .filter((p) => p.negocio_id === negocioId && p.disponible)
          .map((p) => ({
            id: p.id,
            nombre: p.nombre,
            descripcion: p.descripcion,
            precioCentavos: p.precio_centavos,
          })),
      );
    }

    if (
      normalized.includes("FROM PRODUCTOS") &&
      normalized.includes("ANY($2::INT[])")
    ) {
      const negocioId = Number(params[0]);
      const ids = (params[1] as number[]) ?? [];
      return asResult(
        productos
          .filter((p) => p.negocio_id === negocioId && ids.includes(p.id))
          .map((p) => ({
            id: p.id,
            nombre: p.nombre,
            precioCentavos: p.precio_centavos,
            disponible: p.disponible,
          })),
      );
    }

    if (normalized.startsWith("INSERT INTO PEDIDOS")) {
      const ahora = new Date();
      const nuevo = {
        id: nextPedidoId++,
        negocio_id: Number(params[0]),
        cliente_nombre: String(params[1]),
        cliente_telefono: (params[2] as string | null) ?? null,
        tipo_entrega: params[3] as TipoEntrega,
        direccion_entrega: (params[4] as string | null) ?? null,
        estado: "pendiente" as EstadoPedido,
        total_centavos: Number(params[5]),
        notas: (params[6] as string | null) ?? null,
        origen: params[7] as OrigenPedido,
        call_control_id: (params[8] as string | null) ?? null,
        creado_en: ahora,
        actualizado_en: ahora,
      };
      pedidosStore.push(nuevo);
      return asResult([
        {
          id: nuevo.id,
          estado: nuevo.estado,
          creadoEn: nuevo.creado_en,
          actualizadoEn: nuevo.actualizado_en,
        },
      ]);
    }

    if (normalized.startsWith("INSERT INTO PEDIDO_ITEMS")) {
      const nuevoItem = {
        id: nextItemId++,
        pedido_id: Number(params[0]),
        producto_id: Number(params[1]),
        nombre_producto: String(params[2]),
        cantidad: Number(params[3]),
        precio_unitario_centavos: Number(params[4]),
        notas: (params[5] as string | null) ?? null,
      };
      pedidoItemsStore.push(nuevoItem);
      return asResult([{ id: nuevoItem.id }]);
    }

    if (
      normalized.includes("FROM PEDIDOS P") &&
      normalized.includes("P.CALL_CONTROL_ID = $2")
    ) {
      const negocioId = Number(params[0]);
      const callControlId = String(params[1]);
      const encontrado = pedidosStore.find(
        (p) =>
          p.negocio_id === negocioId && p.call_control_id === callControlId,
      );
      if (!encontrado) return asResult([]);
      const items = pedidoItemsStore
        .filter((i) => i.pedido_id === encontrado.id)
        .map((i) => ({
          id: i.id,
          productoId: i.producto_id,
          nombre: i.nombre_producto,
          cantidad: i.cantidad,
          precioUnitarioCentavos: i.precio_unitario_centavos,
          notas: i.notas,
        }));
      return asResult([
        {
          id: encontrado.id,
          clienteNombre: encontrado.cliente_nombre,
          clienteTelefono: encontrado.cliente_telefono,
          tipoEntrega: encontrado.tipo_entrega,
          direccionEntrega: encontrado.direccion_entrega,
          estado: encontrado.estado,
          totalCentavos: encontrado.total_centavos,
          notas: encontrado.notas,
          origen: encontrado.origen,
          creadoEn: encontrado.creado_en,
          actualizadoEn: encontrado.actualizado_en,
          items,
        },
      ]);
    }

    if (
      normalized.includes("FROM PEDIDOS P") &&
      normalized.includes("LEFT JOIN PEDIDO_ITEMS")
    ) {
      const negocioId = Number(params[0]);
      const estadosFiltro = (params[1] as EstadoPedido[] | null) ?? null;
      const limite = Number(params[2] ?? 50);

      const filtrados = pedidosStore
        .filter(
          (p) =>
            p.negocio_id === negocioId &&
            (estadosFiltro === null || estadosFiltro.includes(p.estado)),
        )
        .slice(0, limite)
        .map((p) => ({
          id: p.id,
          clienteNombre: p.cliente_nombre,
          clienteTelefono: p.cliente_telefono,
          tipoEntrega: p.tipo_entrega,
          direccionEntrega: p.direccion_entrega,
          estado: p.estado,
          totalCentavos: p.total_centavos,
          notas: p.notas,
          origen: p.origen,
          creadoEn: p.creado_en,
          actualizadoEn: p.actualizado_en,
          items: pedidoItemsStore
            .filter((i) => i.pedido_id === p.id)
            .map((i) => ({
              id: i.id,
              productoId: i.producto_id,
              nombre: i.nombre_producto,
              cantidad: i.cantidad,
              precioUnitarioCentavos: i.precio_unitario_centavos,
              notas: i.notas,
            })),
        }));
      return asResult(filtrados);
    }

    if (normalized.startsWith("SELECT ESTADO FROM PEDIDOS")) {
      const pedidoId = Number(params[0]);
      const negocioId = Number(params[1]);
      const p = pedidosStore.find(
        (item) => item.id === pedidoId && item.negocio_id === negocioId,
      );
      return asResult(p ? [{ estado: p.estado }] : []);
    }

    if (normalized.startsWith("UPDATE PEDIDOS SET ESTADO")) {
      const pedidoId = Number(params[0]);
      const negocioId = Number(params[1]);
      const nuevoEstado = params[2] as EstadoPedido;
      const estadoEsperado = params[3] as EstadoPedido;
      const p = pedidosStore.find(
        (item) =>
          item.id === pedidoId &&
          item.negocio_id === negocioId &&
          item.estado === estadoEsperado,
      );
      if (!p) return asResult([]);
      p.estado = nuevoEstado;
      p.actualizado_en = new Date();
      return asResult([
        {
          id: p.id,
          estado: p.estado,
          actualizadoEn: p.actualizado_en.toISOString(),
        },
      ]);
    }

    return asResult([]);
  };

  t.mock.method(pool, "query", ejecutarSql);
  t.mock.method(pool, "connect", async () => {
    return {
      query: ejecutarSql,
      release: () => undefined,
    } as unknown as PoolClient;
  });

  // 1. Si ASISTENTE_API_TOKEN no está configurado, responde 503
  delete process.env.ASISTENTE_API_TOKEN;
  const sinConfigRes = await requestApp(app, "/api/asistente/menu", {
    headers: { Authorization: `Bearer ${TOKEN_PRUEBA}` },
  });
  assert.equal(sinConfigRes.status, 503);

  // Configurar token válido para el asistente
  process.env.ASISTENTE_API_TOKEN = TOKEN_PRUEBA;

  // 2. Sin token o con token incorrecto responde 401
  const tokenInvalidoRes = await requestApp(app, "/api/asistente/menu", {
    headers: { Authorization: "Bearer token_incorrecto" },
  });
  assert.equal(tokenInvalidoRes.status, 401);

  // 3. GET /api/asistente/menu devuelve solo productos disponibles con precios en MXN
  const menuRes = await requestApp(app, "/api/asistente/menu", {
    headers: { Authorization: `Bearer ${TOKEN_PRUEBA}` },
  });
  assert.equal(menuRes.status, 200);
  const menuBody = await menuRes.json();
  assert.equal(menuBody.negocio, "Mesa Clara");
  assert.equal(menuBody.productos.length, 2);
  assert.equal(menuBody.productos[0].nombre, "Chilaquiles Verdes");
  assert.equal(menuBody.productos[0].precio, "125.00 MXN");

  // 4. POST /api/asistente/pedidos rechaza productos agotados con 409
  const agotadoRes = await requestApp(app, "/api/asistente/pedidos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN_PRUEBA}`,
    },
    body: JSON.stringify({
      clienteNombre: "Sofía Hernández",
      clienteTelefono: "+525511223344",
      tipoEntrega: "recoger",
      items: [{ productoId: 3, cantidad: 1 }],
    }),
  });
  assert.equal(agotadoRes.status, 409);
  const agotadoBody = await agotadoRes.json();
  assert.equal(agotadoBody.error, "producto_agotado");

  // 5. POST /api/asistente/pedidos crea el pedido y calcula el total real en PostgreSQL
  // (2 Chilaquiles = 25000 + 1 Agua = 4500 => 29500 centavos = 295.00 MXN)
  const crearRes = await requestApp(app, "/api/asistente/pedidos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN_PRUEBA}`,
      "x-telnyx-call-control-id": "v3:call_abc_123",
    },
    body: JSON.stringify({
      clienteNombre: "Sofía Hernández",
      clienteTelefono: "+525511223344",
      tipoEntrega: "recoger",
      notas: "Para llevar en 20 minutos",
      items: [
        { productoId: 1, cantidad: 2, notas: "Poco picante" },
        { productoId: 2, cantidad: 1 },
      ],
    }),
  });
  assert.equal(crearRes.status, 201);
  const pedidoBody = await crearRes.json();
  assert.equal(pedidoBody.pedidoId, 1);
  assert.equal(pedidoBody.totalCentavos, 29500);
  assert.equal(pedidoBody.total, "295.00 MXN");
  assert.equal(pedidoBody.duplicado, false);

  // 6. Idempotencia: si Telnyx reintenta con el mismo x-telnyx-call-control-id, no duplica el pedido
  const reintentoRes = await requestApp(app, "/api/asistente/pedidos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN_PRUEBA}`,
      "x-telnyx-call-control-id": "v3:call_abc_123",
    },
    body: JSON.stringify({
      clienteNombre: "Sofía Hernández",
      clienteTelefono: "+525511223344",
      tipoEntrega: "recoger",
      items: [{ productoId: 1, cantidad: 2 }],
    }),
  });
  assert.equal(reintentoRes.status, 200);
  const reintentoBody = await reintentoRes.json();
  assert.equal(reintentoBody.pedidoId, 1);
  assert.equal(reintentoBody.duplicado, true);

  // 7. El personal (empleado o dueño) consulta y actualiza el pedido desde /api/pedidos
  const cookieEmpleado = "assista_sid=token_empleado_valido";

  const listarRes = await requestApp(app, "/api/pedidos?estado=pendiente", {
    headers: { Cookie: cookieEmpleado },
  });
  assert.equal(listarRes.status, 200);
  const lista = await listarRes.json();
  assert.equal(lista.length, 1);
  assert.equal(lista[0].clienteNombre, "Sofía Hernández");
  assert.equal(lista[0].origen, "telefono_ia");
  assert.equal(lista[0].items.length, 2);

  // Avanzar estado: pendiente -> en_preparacion
  const patchPrep = await requestApp(app, "/api/pedidos/1", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieEmpleado,
    },
    body: JSON.stringify({ estado: "en_preparacion" }),
  });
  assert.equal(patchPrep.status, 200);
  const prepBody = await patchPrep.json();
  assert.equal(prepBody.estado, "en_preparacion");

  // Transición inválida: en_preparacion -> pendiente (409 Conflict)
  const patchInvalido = await requestApp(app, "/api/pedidos/1", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieEmpleado,
    },
    body: JSON.stringify({ estado: "pendiente" }),
  });
  assert.equal(patchInvalido.status, 409);
});

test("Telefonía G.711 (PCMU/PCMA), detector de turnos de voz (VAD) y webhook Call Control de Telnyx", async () => {
  const { app } = await import("./index.ts");

  // 1. Decodificación G.711 PCMU y PCMA a PCM16
  const mulawSilencio = Buffer.alloc(160, 0xff); // 20 ms a 8000 Hz en silencio mu-law
  const pcmDesdeMulaw = mulawAPcm16(mulawSilencio);
  assert.equal(pcmDesdeMulaw.length, 320);
  assert.equal(rmsPcm16(pcmDesdeMulaw), 0);

  const alawMuestras = Buffer.alloc(160, 0xd5);
  const pcmDesdeAlaw = alawAPcm16(alawMuestras);
  assert.equal(pcmDesdeAlaw.length, 320);

  // 2. Empaquetado WAV PCM16
  const wav = construirWavPcm16(pcmDesdeMulaw, 8000);
  assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(wav.subarray(8, 12).toString("ascii"), "WAVE");
  assert.equal(wav.length, 44 + 320);

  // 3. Detector de turnos de voz (VAD por energía RMS):
  // 400 ms de voz (>= 300 ms mínimo) seguidos de 800 ms de silencio (>= 700 ms corte)
  const detector = new DetectorTurnoVoz(8000, 500);
  const bloqueVoz100ms = Buffer.alloc(800 * 2);
  for (let i = 0; i < 800; i++) {
    bloqueVoz100ms.writeInt16LE(4000, i * 2);
  }
  const bloqueSilencio100ms = Buffer.alloc(800 * 2, 0);

  for (let i = 0; i < 4; i++) {
    assert.equal(detector.procesarFragmento(bloqueVoz100ms), null);
  }
  for (let i = 0; i < 6; i++) {
    assert.equal(detector.procesarFragmento(bloqueSilencio100ms), null);
  }
  const turnoCerrado = detector.procesarFragmento(bloqueSilencio100ms);
  assert.ok(turnoCerrado);
  assert.equal(turnoCerrado.length, (4 + 7) * 800 * 2);

  // 4. Webhook de Telnyx (/api/telefonia/webhook)
  const resIniciada = await requestApp(app, "/api/telefonia/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        event_type: "call.initiated",
        payload: {
          call_control_id: "v3:call_test_999",
          from: "+525599887766",
          state: "parked",
        },
      },
    }),
  });
  assert.equal(resIniciada.status, 200);

  const resContestada = await requestApp(app, "/api/telefonia/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        event_type: "call.answered",
        payload: {
          call_control_id: "v3:call_test_999",
        },
      },
    }),
  });
  assert.equal(resContestada.status, 200);

  const resColgada = await requestApp(app, "/api/telefonia/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: {
        event_type: "call.hangup",
        payload: {
          call_control_id: "v3:call_test_999",
        },
      },
    }),
  });
  assert.equal(resColgada.status, 200);
});
