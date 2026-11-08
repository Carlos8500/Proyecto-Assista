import crypto from "node:crypto";
import { Algorithm, hash, verify } from "@node-rs/argon2";

export type RolUsuario = "dueno" | "empleado";

export type UsuarioSesion = {
  id: number;
  nombre: string;
  username: string;
  correo: string;
  rol: RolUsuario;
  negocio: {
    id: number;
    nombre: string;
  };
};

export const SESSION_COOKIE_NAME = "assista_sid";
export const SESSION_DURATION_SHORT_MS = 1000 * 60 * 60 * 24; // 24 horas
export const SESSION_DURATION_REMEMBER_MS = 1000 * 60 * 60 * 24 * 14; // 14 días

export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(
  passwordHash: string,
  plainPassword: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, plainPassword);
  } catch {
    return false;
  }
}

export function generarTokenSesion(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function validarRequisitosPassword(password: string) {
  const minimoOcho = password.length >= 8;
  const tieneMayuscula = /[A-ZÁÉÍÓÚÑ]/.test(password);
  const tieneNumero = /\d/.test(password);

  return {
    minimoOcho,
    tieneMayuscula,
    tieneNumero,
    esValida: minimoOcho && tieneMayuscula && tieneNumero,
  };
}

export function normalizarUsername(valor: string): string {
  return valor.trim().toLowerCase();
}

export function validarUsername(valor: string): boolean {
  const limpio = normalizarUsername(valor);
  return /^[a-z0-9._-]{3,60}$/.test(limpio);
}

export function validarCorreo(valor: string): boolean {
  const limpio = valor.trim().toLowerCase();
  return (
    limpio.length >= 5 &&
    limpio.length <= 160 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)
  );
}

export function esRolValido(rol: unknown): rol is RolUsuario {
  return rol === "dueno" || rol === "empleado";
}

export function puedeAdministrarMenu(rol: RolUsuario): boolean {
  return rol === "dueno";
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  const resultado: Record<string, string> = {};
  for (const parte of cookieHeader.split(";")) {
    const indiceIgual = parte.indexOf("=");
    if (indiceIgual === -1) continue;
    const clave = parte.slice(0, indiceIgual).trim();
    const valor = parte.slice(indiceIgual + 1).trim();
    if (clave) {
      try {
        resultado[clave] = decodeURIComponent(valor);
      } catch {
        resultado[clave] = valor;
      }
    }
  }
  return resultado;
}

export function buildSessionCookie(
  token: string,
  maxAgeMs: number,
  isSecureContext: boolean,
): string {
  const maxAgeSeconds = Math.floor(maxAgeMs / 1000);
  const atributos = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (isSecureContext) {
    atributos.push("SameSite=None", "Secure");
  } else {
    atributos.push("SameSite=Lax");
  }

  return atributos.join("; ");
}

export function buildLogoutCookie(isSecureContext: boolean): string {
  const atributos = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Max-Age=0",
  ];

  if (isSecureContext) {
    atributos.push("SameSite=None", "Secure");
  } else {
    atributos.push("SameSite=Lax");
  }

  return atributos.join("; ");
}
