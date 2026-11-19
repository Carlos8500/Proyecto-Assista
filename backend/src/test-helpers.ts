import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import type { Express } from "express";

/**
 * Ejecuta una petición contra la app de Express en memoria, sin abrir puertos
 * (el sandbox de pruebas no permite conexiones TCP locales).
 */
export async function requestApp(
  app: Express,
  pathname: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
) {
  return new Promise<{
    status: number;
    headers: { get: (name: string) => string | null };
    json: () => Promise<any>;
  }>((resolve, reject) => {
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    req.method = init.method ?? "GET";
    req.url = pathname;
    const rawHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(init.headers ?? {})) {
      rawHeaders[k.toLowerCase()] = v;
    }
    if (init.body !== undefined) {
      rawHeaders["content-length"] = String(Buffer.byteLength(init.body));
    }
    req.headers = rawHeaders;

    const res = new ServerResponse(req);
    const chunks: Buffer[] = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);

    res.write = ((chunk: any, ...args: any[]) => {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      return origWrite(chunk, ...args);
    }) as typeof res.write;

    res.end = ((chunk?: any, ...args: any[]) => {
      if (chunk && typeof chunk !== "function") {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      origEnd(chunk, ...args);
      const rawText = Buffer.concat(chunks).toString("utf8");
      resolve({
        status: res.statusCode,
        headers: {
          get: (name: string) => {
            const val = res.getHeader(name.toLowerCase());
            if (Array.isArray(val)) return val.join(", ");
            return val !== undefined ? String(val) : null;
          },
        },
        json: async () => JSON.parse(rawText),
      });
      return res;
    }) as typeof res.end;

    try {
      app(req, res);
      if (init.body !== undefined) {
        req.push(init.body);
      }
      req.push(null);
    } catch (err) {
      reject(err);
    }
  });
}
