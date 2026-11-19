import { Router } from "express";
import type { Request } from "express";
import { obtenerNegocioConfiguradoId } from "./config.ts";
import { pool } from "./db.ts";
import {
  crearPedido,
  ErrorPedido,
  formatearPrecio,
  validarPedidoEntrada,
} from "./pedidos.ts";

/**
 * Módulo de telefonía y voz adaptado desde `Asistente_Voz_Inteligente/asistente-voz`
 * (`bot_restaurante.py`, `ws_voicecall.py` y `llm_consulting_sql.py`), integrado con
 * la lógica de negocio real de Assista (sin ejecutar SQL libre generado por el LLM).
 */

const TELNYX_API_BASE = "https://api.telnyx.com/v2";
const GROQ_API_BASE = "https://api.groq.com/openai/v1";
const GROQ_CHAT_MODEL = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
const GROQ_WHISPER_MODEL = "whisper-large-v3-turbo";

const MENSAJE_BIENVENIDA_DEFAULT =
  "Bienvenido a Mesa Clara. ¿Qué le gustaría ordenar hoy?";

// ---------------------------------------------------------------------------
// 1. Decodificación de audio G.711 (PCMU / PCMA) y detección de turnos (VAD)
//    Adaptado de `ws_voicecall.py`
// ---------------------------------------------------------------------------

const MU_LAW_BIAS = 0x84;

export const UMBRAL_RMS_DEFAULT = 500;
export const SILENCIO_PARA_CORTAR_MS = 700;
export const HABLA_MINIMA_MS = 300;
export const TURNO_MAXIMO_MS = 15000;

export function mulawAPcm16(mulawBytes: Buffer): Buffer {
  const pcm = Buffer.allocUnsafe(mulawBytes.length * 2);
  for (let i = 0; i < mulawBytes.length; i++) {
    const mu = ~mulawBytes[i] & 0xff;
    const signo = mu & 0x80;
    const exponente = (mu >> 4) & 0x07;
    const mantisa = mu & 0x0f;
    let muestra = ((mantisa << 3) + MU_LAW_BIAS) << exponente;
    muestra -= MU_LAW_BIAS;
    if (signo) {
      muestra = -muestra;
    }
    muestra = Math.max(-32768, Math.min(32767, muestra));
    pcm.writeInt16LE(muestra, i * 2);
  }
  return pcm;
}

export function alawAPcm16(alawBytes: Buffer): Buffer {
  const pcm = Buffer.allocUnsafe(alawBytes.length * 2);
  for (let i = 0; i < alawBytes.length; i++) {
    const aVal = alawBytes[i] ^ 0x55;
    const exponente = (aVal & 0x70) >> 4;
    const mantisa = aVal & 0x0f;
    let muestra = mantisa << 4;
    if (exponente === 0) {
      muestra += 8;
    } else if (exponente === 1) {
      muestra += 0x108;
    } else {
      muestra += 0x108;
      muestra <<= exponente - 1;
    }
    if (!(aVal & 0x80)) {
      muestra = -muestra;
    }
    muestra = Math.max(-32768, Math.min(32767, muestra));
    pcm.writeInt16LE(muestra, i * 2);
  }
  return pcm;
}

export function decodificarAudioG711(
  payloadBase64: string,
  encoding: string = "PCMU",
): Buffer {
  const crudo = Buffer.from(payloadBase64, "base64");
  return encoding.toUpperCase() === "PCMA"
    ? alawAPcm16(crudo)
    : mulawAPcm16(crudo);
}

export function rmsPcm16(pcm16Bytes: Buffer): number {
  const totalMuestras = Math.floor(pcm16Bytes.length / 2);
  if (totalMuestras === 0) return 0;
  let sumaCuadrados = 0;
  for (let i = 0; i < totalMuestras; i++) {
    const muestra = pcm16Bytes.readInt16LE(i * 2);
    sumaCuadrados += muestra * muestra;
  }
  return Math.sqrt(sumaCuadrados / totalMuestras);
}

export function construirWavPcm16(
  pcm16Bytes: Buffer,
  sampleRate: number = 8000,
): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2; // mono, 16-bit (2 bytes)
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm16Bytes.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
  header.writeUInt16LE(1, 20); // AudioFormat = 1 (PCM)
  header.writeUInt16LE(1, 22); // NumChannels = 1
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32); // BlockAlign
  header.writeUInt16LE(16, 34); // BitsPerSample
  header.write("data", 36);
  header.writeUInt32LE(pcm16Bytes.length, 40);
  return Buffer.concat([header, pcm16Bytes]);
}

export class DetectorTurnoVoz {
  readonly sampleRate: number;
  readonly umbralRms: number;
  private fragmentos: Buffer[] = [];
  private msHabla = 0;
  private msSilencio = 0;

  constructor(sampleRate: number = 8000, umbralRms: number = UMBRAL_RMS_DEFAULT) {
    this.sampleRate = sampleRate;
    this.umbralRms = umbralRms;
  }

  procesarFragmento(pcm16: Buffer): Buffer | null {
    if (pcm16.length === 0) return null;
    const duracionMs = (pcm16.length / 2 / this.sampleRate) * 1000;
    const nivel = rmsPcm16(pcm16);

    if (nivel >= this.umbralRms) {
      this.fragmentos.push(pcm16);
      this.msHabla += duracionMs;
      this.msSilencio = 0;
    } else if (this.fragmentos.length > 0) {
      this.fragmentos.push(pcm16);
      this.msSilencio += duracionMs;
    }

    const finDeTurno =
      this.msSilencio >= SILENCIO_PARA_CORTAR_MS &&
      this.msHabla >= HABLA_MINIMA_MS;
    const turnoMuyLargo = this.msHabla >= TURNO_MAXIMO_MS;

    if (this.fragmentos.length > 0 && (finDeTurno || turnoMuyLargo)) {
      const audioCompleto = Buffer.concat(this.fragmentos);
      this.reiniciar();
      return audioCompleto;
    }

    return null;
  }

  reiniciar(): void {
    this.fragmentos = [];
    this.msHabla = 0;
    this.msSilencio = 0;
  }
}

// ---------------------------------------------------------------------------
// 2. Cliente Telnyx Call Control (`bot_restaurante.py`)
// ---------------------------------------------------------------------------

async function enviarAccionTelnyx(
  callControlId: string,
  accion: "answer" | "speak" | "streaming_start",
  body: Record<string, unknown> = {},
): Promise<boolean> {
  const apiKey = process.env.TELNYX_API_KEY?.trim();
  if (!apiKey) {
    console.warn(`TELNYX_API_KEY no configurada; se omitió acción '${accion}'.`);
    return false;
  }

  const respuesta = await fetch(
    `${TELNYX_API_BASE}/calls/${encodeURIComponent(callControlId)}/actions/${accion}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "");
    console.error(
      `Error en Telnyx (${accion} -> ${respuesta.status}):`,
      detalle,
    );
    return false;
  }
  return true;
}

export async function contestarLlamada(callControlId: string): Promise<boolean> {
  return enviarAccionTelnyx(callControlId, "answer");
}

export async function hablarEnLlamada(
  callControlId: string,
  texto: string,
): Promise<boolean> {
  return enviarAccionTelnyx(callControlId, "speak", {
    payload: texto,
    voice: "female",
    language: "es-MX",
    payload_type: "text",
  });
}

export async function iniciarStreamingLlamada(
  callControlId: string,
  streamUrl: string,
): Promise<boolean> {
  return enviarAccionTelnyx(callControlId, "streaming_start", {
    stream_url: streamUrl,
    stream_track: "inbound_track",
  });
}

// ---------------------------------------------------------------------------
// 3. Memoria conversacional y agente con Groq Tool Calling (sin SQL crudo)
// ---------------------------------------------------------------------------

type MensajeChat = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
};

type SesionLlamada = {
  callControlId: string;
  clienteTelefono: string | null;
  historial: MensajeChat[];
  actualizadoEn: number;
};

const sesionesLlamada = new Map<string, SesionLlamada>();
const EXPIRACION_SESION_LLAMADA_MS = 1000 * 60 * 30; // 30 minutos

function limpiarSesionesExpiradas() {
  const ahora = Date.now();
  for (const [id, sesion] of sesionesLlamada.entries()) {
    if (ahora - sesion.actualizadoEn > EXPIRACION_SESION_LLAMADA_MS) {
      sesionesLlamada.delete(id);
    }
  }
}

export function obtenerOCrearSesionLlamada(
  callControlId: string,
  clienteTelefono: string | null = null,
): SesionLlamada {
  limpiarSesionesExpiradas();
  let sesion = sesionesLlamada.get(callControlId);
  if (!sesion) {
    sesion = {
      callControlId,
      clienteTelefono,
      historial: [],
      actualizadoEn: Date.now(),
    };
    sesionesLlamada.set(callControlId, sesion);
  } else {
    if (clienteTelefono && !sesion.clienteTelefono) {
      sesion.clienteTelefono = clienteTelefono;
    }
    sesion.actualizadoEn = Date.now();
  }
  return sesion;
}

export function finalizarSesionLlamada(callControlId: string): void {
  sesionesLlamada.delete(callControlId);
}

async function construirPromptSistema(
  negocioId: number,
  clienteTelefono: string | null,
): Promise<string> {
  const negocioRes = await pool.query(
    "SELECT nombre FROM negocios WHERE id = $1",
    [negocioId],
  );
  const nombreNegocio =
    negocioRes.rows.length > 0 ? String(negocioRes.rows[0].nombre) : "Mesa Clara";

  const { rows } = await pool.query(
    `SELECT id, nombre, descripcion, precio_centavos AS "precioCentavos"
     FROM productos
     WHERE negocio_id = $1 AND disponible = true
     ORDER BY id`,
    [negocioId],
  );

  const listadoMenu =
    rows.length > 0
      ? rows
          .map(
            (p) =>
              `- ID ${p.id}: ${p.nombre} (${formatearPrecio(Number(p.precioCentavos))}) — ${p.descripcion}`,
          )
          .join("\n")
      : "- (No hay productos disponibles en este momento)";

  return [
    `Eres el asistente telefónico de voz del restaurante "${nombreNegocio}".`,
    "Responde siempre en español natural, breve y amable, ideal para ser leído por voz (sin tablas, sin viñetas ni formato Markdown).",
    "Solo puedes ofrecer los productos que aparecen en el siguiente menú disponible:",
    listadoMenu,
    clienteTelefono
      ? `Teléfono detectado de la llamada: ${clienteTelefono}.`
      : "Si el cliente quiere ordenar, pídele su nombre y teléfono de contacto.",
    "Antes de invocar la función `registrar_pedido`, confirma con el cliente su nombre, los platillos con cantidades y si pasa a recoger o requiere entrega a domicilio (con dirección).",
  ].join("\n\n");
}

const DEFINICION_HERRAMIENTA_PEDIDO = {
  type: "function",
  function: {
    name: "registrar_pedido",
    description:
      "Registra el pedido confirmado del cliente en la base de datos del restaurante.",
    parameters: {
      type: "object",
      properties: {
        clienteNombre: {
          type: "string",
          description: "Nombre del cliente.",
        },
        clienteTelefono: {
          type: "string",
          description: "Teléfono del cliente (7 a 15 dígitos).",
        },
        tipoEntrega: {
          type: "string",
          enum: ["recoger", "domicilio"],
          description: "Modalidad de entrega del pedido.",
        },
        direccionEntrega: {
          type: "string",
          description: "Dirección completa si tipoEntrega es 'domicilio'.",
        },
        notas: {
          type: "string",
          description: "Indicaciones generales del pedido.",
        },
        items: {
          type: "array",
          description: "Lista de productos solicitados con su ID del menú.",
          items: {
            type: "object",
            properties: {
              productoId: { type: "integer" },
              cantidad: { type: "integer" },
              notas: { type: "string" },
            },
            required: ["productoId", "cantidad"],
          },
        },
      },
      required: ["clienteNombre", "items"],
    },
  },
};

export async function responderTurnoLlamada(
  callControlId: string,
  textoUsuario: string,
  clienteTelefono: string | null = null,
): Promise<{ respuesta: string; pedidoId: number | null }> {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey) {
    throw new Error("GROQ_API_KEY no está configurada.");
  }

  const negocioId = obtenerNegocioConfiguradoId();
  const sesion = obtenerOCrearSesionLlamada(callControlId, clienteTelefono);
  const systemPrompt = await construirPromptSistema(
    negocioId,
    sesion.clienteTelefono,
  );

  sesion.historial.push({ role: "user", content: textoUsuario.trim() });

  const llamarGroq = async (mensajes: MensajeChat[], conTools: boolean) => {
    const res = await fetch(`${GROQ_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_CHAT_MODEL,
        temperature: 0.2,
        messages: [{ role: "system", content: systemPrompt }, ...mensajes],
        ...(conTools
          ? { tools: [DEFINICION_HERRAMIENTA_PEDIDO], tool_choice: "auto" }
          : {}),
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Error de Groq (${res.status}): ${errText}`);
    }
    return (await res.json()) as {
      choices: {
        message: {
          role: "assistant";
          content: string | null;
          tool_calls?: MensajeChat["tool_calls"];
        };
      }[];
    };
  };

  const primera = await llamarGroq(sesion.historial, true);
  const mensajeAsistente = primera.choices[0]?.message;

  if (!mensajeAsistente) {
    throw new Error("Groq no devolvió respuesta.");
  }

  if (
    !mensajeAsistente.tool_calls ||
    mensajeAsistente.tool_calls.length === 0
  ) {
    const texto =
      mensajeAsistente.content?.trim() ||
      "¿Me podría repetir su pedido, por favor?";
    sesion.historial.push({ role: "assistant", content: texto });
    return { respuesta: texto, pedidoId: null };
  }

  // El asistente decidió invocar `registrar_pedido`
  sesion.historial.push({
    role: "assistant",
    content: mensajeAsistente.content ?? null,
    tool_calls: mensajeAsistente.tool_calls,
  });

  let pedidoCreadoId: number | null = null;

  for (const toolCall of mensajeAsistente.tool_calls) {
    let resultadoTool: Record<string, unknown>;
    try {
      const args = JSON.parse(toolCall.function.arguments || "{}");
      if (!args.clienteTelefono && sesion.clienteTelefono) {
        args.clienteTelefono = sesion.clienteTelefono;
      }

      const validacion = validarPedidoEntrada(args);
      if (!validacion.ok) {
        resultadoTool = { ok: false, error: validacion.mensaje };
      } else {
        const { pedido, duplicado } = await crearPedido(
          negocioId,
          validacion.pedido,
          { origen: "telefono_ia", callControlId },
        );
        pedidoCreadoId = pedido.id;
        resultadoTool = {
          ok: true,
          pedidoId: pedido.id,
          duplicado,
          total: formatearPrecio(pedido.totalCentavos),
        };
      }
    } catch (error) {
      if (error instanceof ErrorPedido) {
        resultadoTool = {
          ok: false,
          codigo: error.codigo,
          error: error.message,
        };
      } else {
        resultadoTool = {
          ok: false,
          error: "Error interno al guardar el pedido.",
        };
      }
    }

    sesion.historial.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify(resultadoTool),
    });
  }

  const segunda = await llamarGroq(sesion.historial, false);
  const textoFinal =
    segunda.choices[0]?.message?.content?.trim() ||
    (pedidoCreadoId
      ? `Su pedido número ${pedidoCreadoId} ha quedado registrado. ¡Gracias por llamar!`
      : "Hubo un inconveniente al registrar el pedido. ¿Desea intentar con otro platillo?");

  sesion.historial.push({ role: "assistant", content: textoFinal });
  return { respuesta: textoFinal, pedidoId: pedidoCreadoId };
}

// ---------------------------------------------------------------------------
// 4. Rutas Express (`/api/telefonia/*`)
// ---------------------------------------------------------------------------

function extraerCallControlIdWebhook(request: Request): {
  eventType: string;
  callControlId: string | null;
  from: string | null;
} {
  const data = request.body?.data ?? {};
  const eventType = typeof data.event_type === "string" ? data.event_type : "";
  const payload = data.payload ?? {};
  const callControlId =
    typeof payload.call_control_id === "string" && payload.call_control_id.trim()
      ? payload.call_control_id.trim()
      : null;
  const from =
    typeof payload.from === "string" && payload.from.trim()
      ? payload.from.trim()
      : null;
  return { eventType, callControlId, from };
}

export function crearRouterTelefonia() {
  const router = Router();

  // POST /api/telefonia/webhook — Eventos Call Control de Telnyx (`bot_restaurante.py`)
  router.post("/webhook", async (request, response) => {
    const { eventType, callControlId, from } =
      extraerCallControlIdWebhook(request);

    if (!eventType || !callControlId) {
      response.status(400).json({ message: "Evento de Telnyx inválido." });
      return;
    }

    try {
      if (eventType === "call.initiated") {
        obtenerOCrearSesionLlamada(callControlId, from);
        await contestarLlamada(callControlId);
      } else if (eventType === "call.answered") {
        const bienvenida =
          process.env.MENSAJE_BIENVENIDA?.trim() || MENSAJE_BIENVENIDA_DEFAULT;
        await hablarEnLlamada(callControlId, bienvenida);

        const streamUrl = process.env.TELNYX_STREAM_URL?.trim();
        if (streamUrl) {
          await iniciarStreamingLlamada(callControlId, streamUrl);
        }
      } else if (eventType === "call.hangup") {
        finalizarSesionLlamada(callControlId);
      }

      response.status(200).json({ ok: true, eventType });
    } catch (error) {
      console.error("Error en webhook de telefonía:", error);
      response.status(500).json({ message: "Error al procesar evento de llamada." });
    }
  });

  // POST /api/telefonia/turno — Procesa un turno de voz transcrito con memoria y Groq
  router.post("/turno", async (request, response) => {
    const { callControlId, texto, clienteTelefono, hablar } = request.body ?? {};
    const idLlamada =
      typeof callControlId === "string" ? callControlId.trim() : "";
    const frase = typeof texto === "string" ? texto.trim() : "";
    const telefono =
      typeof clienteTelefono === "string" && clienteTelefono.trim()
        ? clienteTelefono.trim()
        : null;

    if (!idLlamada || !frase) {
      response.status(400).json({
        message: "Se requieren callControlId y texto.",
      });
      return;
    }

    try {
      const resultado = await responderTurnoLlamada(idLlamada, frase, telefono);
      if (hablar !== false && process.env.TELNYX_API_KEY?.trim()) {
        await hablarEnLlamada(idLlamada, resultado.respuesta);
      }
      response.json(resultado);
    } catch (error) {
      console.error("Error al procesar turno de llamada:", error);
      response.status(500).json({
        message: "No se pudo procesar el turno de conversación.",
      });
    }
  });

  return router;
}
