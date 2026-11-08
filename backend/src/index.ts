import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { Request, Response } from "express";
import {
  buildLogoutCookie,
  buildSessionCookie,
  esRolValido,
  generarTokenSesion,
  hashPassword,
  normalizarUsername,
  parseCookies,
  puedeAdministrarMenu,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_REMEMBER_MS,
  SESSION_DURATION_SHORT_MS,
  validarCorreo,
  validarRequisitosPassword,
  validarUsername,
  verifyPassword,
} from "./auth.ts";
import type { RolUsuario, UsuarioSesion } from "./auth.ts";
import { pool } from "./db.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
const port = Number(process.env.PORT) || 3000;

app.set("trust proxy", 1);
app.use(express.json());

function esContextoSeguro(request: Request): boolean {
  const proto = request.headers["x-forwarded-proto"];
  if (typeof proto === "string" && proto.includes("https")) {
    return true;
  }
  return request.secure === true;
}

function extraerTokenSesion(request: Request): string | null {
  const cookies = parseCookies(request.headers.cookie);
  if (cookies[SESSION_COOKIE_NAME]) {
    return cookies[SESSION_COOKIE_NAME];
  }

  const headerToken = request.headers["x-session-token"];
  if (typeof headerToken === "string" && headerToken.trim()) {
    return headerToken.trim();
  }

  return null;
}

async function obtenerUsuarioDeSesion(
  request: Request,
): Promise<UsuarioSesion | null> {
  const token = extraerTokenSesion(request);
  if (!token) {
    return null;
  }

  const { rows } = await pool.query(
    `SELECT u.id, u.nombre, u.username, u.correo, u.rol,
            n.id AS "negocioId", n.nombre AS "negocioNombre"
     FROM sesiones s
     JOIN usuarios u ON u.id = s.usuario_id
     JOIN negocios n ON n.id = u.negocio_id
     WHERE s.token = $1 AND s.expira_en > now()`,
    [token],
  );

  if (rows.length === 0) {
    return null;
  }

  const fila = rows[0];
  return {
    id: Number(fila.id),
    nombre: String(fila.nombre),
    username: String(fila.username),
    correo: String(fila.correo),
    rol: fila.rol as RolUsuario,
    negocio: {
      id: Number(fila.negocioId),
      nombre: String(fila.negocioNombre),
    },
  };
}

async function iniciarSesionUsuario(
  response: Response,
  request: Request,
  usuario: UsuarioSesion,
  recordarme: boolean,
) {
  const token = generarTokenSesion();
  const duracionMs = recordarme
    ? SESSION_DURATION_REMEMBER_MS
    : SESSION_DURATION_SHORT_MS;
  const expiraEn = new Date(Date.now() + duracionMs);

  await pool.query(
    `INSERT INTO sesiones (token, usuario_id, expira_en)
     VALUES ($1, $2, $3)`,
    [token, usuario.id, expiraEn],
  );

  response.setHeader(
    "Set-Cookie",
    buildSessionCookie(token, duracionMs, esContextoSeguro(request)),
  );

  return token;
}

app.get("/api/health", (_request, response) => {
  response.json({ message: "Backend de Assista conectado" });
});

app.get("/api/auth/check-username", async (request, response) => {
  const raw = typeof request.query.username === "string" ? request.query.username : "";
  const username = normalizarUsername(raw);

  if (!validarUsername(username)) {
    response.json({ disponible: false, valido: false });
    return;
  }

  try {
    const { rows } = await pool.query(
      "SELECT id, username, correo FROM usuarios WHERE LOWER(username) = LOWER($1)",
      [username, ""],
    );
    response.json({ disponible: rows.length === 0, valido: true });
  } catch (error) {
    console.error("Error al verificar usuario:", error);
    response.status(500).json({ message: "No se pudo verificar el usuario" });
  }
});

app.post("/api/auth/login", async (request, response) => {
  const { username, password, recordarme } = request.body ?? {};
  const identificador =
    typeof username === "string" ? username.trim().toLowerCase() : "";
  const clave = typeof password === "string" ? password : "";

  if (!identificador || !clave) {
    response.status(400).json({
      message: "Ingresa tu nombre de usuario y contraseña.",
    });
    return;
  }

  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, u.username, u.correo,
              u.password_hash AS "passwordHash", u.rol,
              n.id AS "negocioId", n.nombre AS "negocioNombre"
       FROM usuarios u
       JOIN negocios n ON n.id = u.negocio_id
       WHERE LOWER(u.username) = LOWER($1) OR LOWER(u.correo) = LOWER($1)`,
      [identificador],
    );

    if (rows.length === 0) {
      response.status(401).json({
        message: "Usuario o contraseña incorrectos.",
      });
      return;
    }

    const fila = rows[0];
    const coincide = await verifyPassword(String(fila.passwordHash), clave);

    if (!coincide) {
      response.status(401).json({
        message: "Usuario o contraseña incorrectos.",
      });
      return;
    }

    const usuario: UsuarioSesion = {
      id: Number(fila.id),
      nombre: String(fila.nombre),
      username: String(fila.username),
      correo: String(fila.correo),
      rol: fila.rol as RolUsuario,
      negocio: {
        id: Number(fila.negocioId),
        nombre: String(fila.negocioNombre),
      },
    };

    const sessionToken = await iniciarSesionUsuario(
      response,
      request,
      usuario,
      Boolean(recordarme),
    );

    response.json({
      ...usuario,
      sessionToken,
    });
  } catch (error) {
    console.error("Error en inicio de sesión:", error);
    response.status(500).json({
      message: "No se pudo iniciar sesión. Intenta de nuevo.",
    });
  }
});

app.post("/api/auth/register", async (request, response) => {
  const { nombre, username, correo, rol, password, negocioId } =
    request.body ?? {};

  const nombreLimpio = typeof nombre === "string" ? nombre.trim() : "";
  const usernameLimpio =
    typeof username === "string" ? normalizarUsername(username) : "";
  const correoLimpio =
    typeof correo === "string" ? correo.trim().toLowerCase() : "";
  const clave = typeof password === "string" ? password : "";
  const negocioDestino =
    typeof negocioId === "number" && Number.isInteger(negocioId) && negocioId >= 1
      ? negocioId
      : 1;

  if (!nombreLimpio || nombreLimpio.length > 120) {
    response.status(400).json({
      message: "El nombre completo debe tener entre 1 y 120 caracteres.",
    });
    return;
  }

  if (!validarUsername(usernameLimpio)) {
    response.status(400).json({
      message:
        "El nombre de usuario debe tener entre 3 y 60 caracteres (letras, números, puntos o guiones).",
    });
    return;
  }

  if (!validarCorreo(correoLimpio)) {
    response.status(400).json({
      message: "Ingresa un correo electrónico válido.",
    });
    return;
  }

  if (!esRolValido(rol)) {
    response.status(400).json({
      message: "Selecciona un rol válido (empleado o dueño).",
    });
    return;
  }

  const validacionClave = validarRequisitosPassword(clave);
  if (!validacionClave.esValida) {
    response.status(400).json({
      message:
        "La contraseña debe tener al menos 8 caracteres, una mayúscula y un número.",
    });
    return;
  }

  try {
    const existentes = await pool.query(
      "SELECT id, username, correo FROM usuarios WHERE LOWER(username) = LOWER($1) OR LOWER(correo) = LOWER($2)",
      [usernameLimpio, correoLimpio],
    );

    if (existentes.rows.length > 0) {
      const conflicto = existentes.rows[0];
      if (String(conflicto.username).toLowerCase() === usernameLimpio) {
        response.status(409).json({
          message: "Ese nombre de usuario ya está en uso.",
        });
        return;
      }
      response.status(409).json({
        message: "Ese correo electrónico ya está registrado.",
      });
      return;
    }

    const negocioRes = await pool.query(
      "SELECT id, nombre FROM negocios WHERE id = $1",
      [negocioDestino],
    );

    if (negocioRes.rows.length === 0) {
      response.status(400).json({
        message: "El negocio seleccionado no existe.",
      });
      return;
    }

    const passwordHash = await hashPassword(clave);
    const { rows } = await pool.query(
      `INSERT INTO usuarios (negocio_id, nombre, username, correo, password_hash, rol)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, negocio_id AS "negocioId", nombre, username, correo, rol`,
      [
        negocioDestino,
        nombreLimpio,
        usernameLimpio,
        correoLimpio,
        passwordHash,
        rol,
      ],
    );

    const creado = rows[0];
    const negocio = negocioRes.rows[0];

    const usuario: UsuarioSesion = {
      id: Number(creado.id),
      nombre: String(creado.nombre),
      username: String(creado.username),
      correo: String(creado.correo),
      rol: creado.rol as RolUsuario,
      negocio: {
        id: Number(negocio.id),
        nombre: String(negocio.nombre),
      },
    };

    const sessionToken = await iniciarSesionUsuario(
      response,
      request,
      usuario,
      true,
    );

    response.status(201).json({
      ...usuario,
      sessionToken,
    });
  } catch (error) {
    console.error("Error al registrar usuario:", error);
    response.status(500).json({
      message: "No se pudo crear la cuenta. Intenta nuevamente.",
    });
  }
});

app.get("/api/auth/me", async (request, response) => {
  try {
    const usuario = await obtenerUsuarioDeSesion(request);

    if (!usuario) {
      if (request.query.silent === "1") {
        response.json({ autenticado: false, usuario: null });
        return;
      }
      response.status(401).json({ message: "No hay una sesión activa" });
      return;
    }

    response.json(usuario);
  } catch (error) {
    console.error("Error al consultar la sesión:", error);
    response.status(500).json({ message: "No se pudo verificar la sesión" });
  }
});

app.post("/api/auth/logout", async (request, response) => {
  try {
    const token = extraerTokenSesion(request);
    if (token) {
      await pool.query("DELETE FROM sesiones WHERE token = $1", [token]);
    }

    response.setHeader(
      "Set-Cookie",
      buildLogoutCookie(esContextoSeguro(request)),
    );
    response.json({ message: "Sesión cerrada correctamente" });
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
    response.status(500).json({ message: "No se pudo cerrar la sesión" });
  }
});

app.get("/api/negocio", async (request, response) => {
  try {
    const sesion = await obtenerUsuarioDeSesion(request);
    if (!sesion) {
      response.status(401).json({ message: "Inicia sesión para continuar" });
      return;
    }

    const { rows } = await pool.query(
      "SELECT id, nombre FROM negocios WHERE id = $1",
      [sesion.negocio.id],
    );

    if (rows.length === 0) {
      response.status(404).json({ message: "Negocio no encontrado" });
      return;
    }

    response.json(rows[0]);
  } catch (error) {
    console.error("Error al consultar el negocio:", error);
    response.status(500).json({ message: "No se pudo consultar el negocio" });
  }
});

app.get("/api/productos", async (request, response) => {
  try {
    const sesion = await obtenerUsuarioDeSesion(request);
    if (!sesion) {
      response.status(401).json({ message: "Inicia sesión para continuar" });
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, nombre, descripcion,
              precio_centavos AS "precioCentavos", disponible
       FROM productos
       WHERE negocio_id = $1
       ORDER BY id`,
      [sesion.negocio.id],
    );

    response.json(rows);
  } catch (error) {
    console.error("Error al listar productos:", error);
    response.status(500).json({ message: "No se pudieron listar los productos" });
  }
});

app.post("/api/productos", async (request, response) => {
  let sesion: UsuarioSesion | null = null;
  try {
    sesion = await obtenerUsuarioDeSesion(request);
  } catch (error) {
    console.error("Error al verificar sesión:", error);
    response.status(500).json({ message: "No se pudo verificar la sesión" });
    return;
  }

  if (!sesion) {
    response.status(401).json({ message: "Inicia sesión para continuar" });
    return;
  }

  if (!puedeAdministrarMenu(sesion.rol)) {
    response.status(403).json({
      message: "Solo el dueño del negocio puede agregar productos al menú",
    });
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
      [sesion.negocio.id, nombreLimpio, descripcionLimpia, precioCentavos],
    );

    response.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error al crear el producto:", error);
    response.status(500).json({ message: "No se pudo crear el producto" });
  }
});

app.patch("/api/productos/:id", async (request, response) => {
  let sesion: UsuarioSesion | null = null;
  try {
    sesion = await obtenerUsuarioDeSesion(request);
  } catch (error) {
    console.error("Error al verificar sesión:", error);
    response.status(500).json({ message: "No se pudo verificar la sesión" });
    return;
  }

  if (!sesion) {
    response.status(401).json({ message: "Inicia sesión para continuar" });
    return;
  }

  if (!puedeAdministrarMenu(sesion.rol)) {
    response.status(403).json({
      message: "Solo el dueño del negocio puede modificar productos del menú",
    });
    return;
  }

  const productoId = Number(request.params.id);

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
        sesion.negocio.id,
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

const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get("/{*splat}", (_request, response) => {
    response.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

if (process.env.NODE_ENV !== "test") {
  app.listen(port, "0.0.0.0", () => {
    console.log(`API de Assista en http://0.0.0.0:${port}`);
  });
}


