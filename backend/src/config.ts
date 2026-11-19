const LONGITUD_MINIMA_TOKEN_ASISTENTE = 16;

/**
 * Assista atiende a un solo restaurante: el configurado en DEMO_NEGOCIO_ID.
 */
export function obtenerNegocioConfiguradoId(): number {
  const raw = Number(process.env.DEMO_NEGOCIO_ID);
  return Number.isInteger(raw) && raw >= 1 ? raw : 1;
}

/**
 * Token compartido con Telnyx para autenticar los Webhook Tools del asistente.
 * Devuelve null si no está configurado o es demasiado corto, en cuyo caso los
 * endpoints del asistente quedan deshabilitados.
 */
export function obtenerTokenAsistente(): string | null {
  const token = process.env.ASISTENTE_API_TOKEN?.trim();
  if (!token || token.length < LONGITUD_MINIMA_TOKEN_ASISTENTE) {
    return null;
  }
  return token;
}
