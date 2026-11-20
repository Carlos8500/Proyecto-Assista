import test from "node:test";
import assert from "node:assert/strict";
import type { QueryResult } from "pg";
import {
  buildLogoutCookie,
  buildSessionCookie,
  esRolValido,
  hashPassword,
  parseCookies,
  puedeAdministrarMenu,
  validarCorreo,
  validarRequisitosPassword,
  validarUsername,
  verifyPassword,
} from "./auth.ts";
import type { RolUsuario } from "./auth.ts";
import { pool } from "./db.ts";
import { requestApp } from "./test-helpers.ts";

process.env.NODE_ENV = "test";
process.env.DEMO_NEGOCIO_ID = "1";
process.env.CODIGO_INVITACION = "MESA-CLARA-2026";

test("Argon2id hashPassword y verifyPassword verifican contraseñas correctamente", async () => {
  const hash = await hashPassword("MesaClara2026");
  assert.equal(hash.startsWith("$argon2id$"), true);
  assert.equal(await verifyPassword(hash, "MesaClara2026"), true);
  assert.equal(await verifyPassword(hash, "Incorrecta123"), false);
});

test("validarRequisitosPassword valida mínimo 8 caracteres, mayúscula y número", () => {
  assert.deepEqual(validarRequisitosPassword("corta1A"), {
    minimoOcho: false,
    tieneMayuscula: true,
    tieneNumero: true,
    esValida: false,
  });
  assert.deepEqual(validarRequisitosPassword("minusculas123"), {
    minimoOcho: true,
    tieneMayuscula: false,
    tieneNumero: true,
    esValida: false,
  });
  assert.deepEqual(validarRequisitosPassword("SoloLetrasMayus"), {
    minimoOcho: true,
    tieneMayuscula: true,
    tieneNumero: false,
    esValida: false,
  });
  assert.deepEqual(validarRequisitosPassword("MesaClara2026"), {
    minimoOcho: true,
    tieneMayuscula: true,
    tieneNumero: true,
    esValida: true,
  });
});

test("validadores de username, correo, rol y permisos de menú", () => {
  assert.equal(validarUsername("lucia.garcia"), true);
  assert.equal(validarUsername("ab"), false);
  assert.equal(validarCorreo("lucia.garcia@mesaclara.mx"), true);
  assert.equal(validarCorreo("invalido"), false);
  assert.equal(esRolValido("dueno"), true);
  assert.equal(esRolValido("empleado"), true);
  assert.equal(esRolValido("admin"), false);
  assert.equal(puedeAdministrarMenu("dueno"), true);
  assert.equal(puedeAdministrarMenu("empleado"), false);
});

test("parseCookies y constructores de cookies HttpOnly", () => {
  const cookieStr = buildSessionCookie("tok_123", 60000, false);
  assert.equal(cookieStr.includes("HttpOnly"), true);
  assert.equal(cookieStr.includes("SameSite=Lax"), true);
  const parsed = parseCookies("assista_sid=tok_123; otra=valor");
  assert.equal(parsed.assista_sid, "tok_123");

  const logoutStr = buildLogoutCookie(true);
  assert.equal(logoutStr.includes("Max-Age=0"), true);
  assert.equal(logoutStr.includes("SameSite=None; Secure"), true);
});

test("Errores de PostgreSQL se propagan y no se ocultan con un fallback en memoria", async (t) => {
  const { app } = await import("./index.ts");

  t.mock.method(pool, "query", async () => {
    const dbError = new Error('relation "usuarios" does not exist') as Error & {
      code?: string;
    };
    dbError.code = "42P01";
    throw dbError;
  });

  const checkRes = await requestApp(
    app,
    "/api/auth/check-username?username=lucia.garcia",
  );
  assert.equal(checkRes.status, 500);

  const loginRes = await requestApp(app, "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "lucia.garcia",
      password: "MesaClara2026",
    }),
  });
  assert.equal(loginRes.status, 500);
});

test("Integración completa: seguridad de /api/auth/register, login, /api/auth/me, edición por dueño, bloqueo a empleado, aislamiento entre negocios y logout", async (t) => {
  const { app } = await import("./index.ts");

  const hashMesaClara = await hashPassword("MesaClara2026");
  const hashReforma = await hashPassword("Reforma2026");

  const negocios = [
    { id: 1, nombre: "Mesa Clara" },
    { id: 2, nombre: "Comedor Reforma" },
  ];

  const usuarios: {
    id: number;
    negocio_id: number;
    nombre: string;
    username: string;
    correo: string;
    password_hash: string;
    rol: RolUsuario;
  }[] = [
    {
      id: 1,
      negocio_id: 1,
      nombre: "Lucía García",
      username: "lucia.garcia",
      correo: "lucia.garcia@mesaclara.mx",
      password_hash: hashMesaClara,
      rol: "dueno",
    },
    {
      id: 2,
      negocio_id: 1,
      nombre: "Carlos Méndez",
      username: "carlos.mendez",
      correo: "carlos.mendez@mesaclara.mx",
      password_hash: hashMesaClara,
      rol: "empleado",
    },
    {
      id: 3,
      negocio_id: 2,
      nombre: "Marco Silva",
      username: "marco.silva",
      correo: "marco.silva@comedorreforma.mx",
      password_hash: hashReforma,
      rol: "dueno",
    },
  ];
  let nextUsuarioId = 4;

  const productos = [
    {
      id: 1,
      negocio_id: 1,
      nombre: "Chilaquiles Verdes",
      descripcion:
        "Totopos crujientes bañados en salsa de tomatillo asado con crema, queso fresco y cebolla.",
      precio_centavos: 12500,
      disponible: true,
    },
  ];

  const sesiones = new Map<
    string,
    { token: string; usuario_id: number; expira_en: Date }
  >();

  t.mock.method(
    pool,
    "query",
    async (sqlText: string, params: unknown[] = []) => {
      const normalized = sqlText.replace(/\s+/g, " ").trim().toUpperCase();
      const asResult = (rows: Record<string, unknown>[]) =>
        ({ rows }) as unknown as QueryResult;

      if (normalized.startsWith("SELECT ID, NOMBRE FROM NEGOCIOS")) {
        const id = Number(params[0]);
        return asResult(negocios.filter((n) => n.id === id));
      }

      if (
        normalized.includes("FROM USUARIOS U") &&
        normalized.includes("JOIN NEGOCIOS N")
      ) {
        const identificador = String(params[0] ?? "")
          .trim()
          .toLowerCase();
        const usuario = usuarios.find(
          (u) =>
            u.username.toLowerCase() === identificador ||
            u.correo.toLowerCase() === identificador,
        );
        if (!usuario) return asResult([]);
        const negocio = negocios.find((n) => n.id === usuario.negocio_id);
        if (!negocio) return asResult([]);
        return asResult([
          {
            id: usuario.id,
            nombre: usuario.nombre,
            username: usuario.username,
            correo: usuario.correo,
            passwordHash: usuario.password_hash,
            rol: usuario.rol,
            negocioId: negocio.id,
            negocioNombre: negocio.nombre,
          },
        ]);
      }

      if (
        normalized.startsWith("SELECT ID FROM USUARIOS") ||
        normalized.startsWith("SELECT ID, USERNAME, CORREO FROM USUARIOS")
      ) {
        assert.equal(
          params.length,
          normalized.includes("$2") ? 2 : 1,
          "La cantidad de parámetros debe coincidir con los placeholders SQL",
        );
        const username = String(params[0] ?? "")
          .trim()
          .toLowerCase();
        const correo = String(params[1] ?? "")
          .trim()
          .toLowerCase();
        return asResult(
          usuarios
            .filter(
              (u) =>
                u.username.toLowerCase() === username ||
                (correo !== "" && u.correo.toLowerCase() === correo),
            )
            .map((u) => ({
              id: u.id,
              username: u.username,
              correo: u.correo,
            })),
        );
      }

      if (normalized.startsWith("INSERT INTO USUARIOS")) {
        const nuevo = {
          id: nextUsuarioId++,
          negocio_id: Number(params[0]),
          nombre: String(params[1]),
          username: String(params[2]).toLowerCase(),
          correo: String(params[3]).toLowerCase(),
          password_hash: String(params[4]),
          rol: params[5] as RolUsuario,
        };
        usuarios.push(nuevo);
        return asResult([
          {
            id: nuevo.id,
            negocioId: nuevo.negocio_id,
            nombre: nuevo.nombre,
            username: nuevo.username,
            correo: nuevo.correo,
            rol: nuevo.rol,
          },
        ]);
      }

      if (normalized.startsWith("INSERT INTO SESIONES")) {
        const token = String(params[0]);
        const usuarioId = Number(params[1]);
        const expiraEn =
          params[2] instanceof Date ? params[2] : new Date(String(params[2]));
        sesiones.set(token, {
          token,
          usuario_id: usuarioId,
          expira_en: expiraEn,
        });
        return asResult([{ token }]);
      }

      if (
        normalized.includes("FROM SESIONES S") &&
        normalized.includes("JOIN USUARIOS U")
      ) {
        const token = String(params[0] ?? "");
        const sesion = sesiones.get(token);
        if (!sesion || sesion.expira_en.getTime() <= Date.now()) {
          return asResult([]);
        }
        const usuario = usuarios.find((u) => u.id === sesion.usuario_id);
        if (!usuario) return asResult([]);
        const negocio = negocios.find((n) => n.id === usuario.negocio_id);
        if (!negocio) return asResult([]);
        return asResult([
          {
            id: usuario.id,
            nombre: usuario.nombre,
            username: usuario.username,
            correo: usuario.correo,
            rol: usuario.rol,
            negocioId: negocio.id,
            negocioNombre: negocio.nombre,
          },
        ]);
      }

      if (normalized.startsWith("DELETE FROM SESIONES")) {
        sesiones.delete(String(params[0] ?? ""));
        return asResult([]);
      }

      if (
        normalized.includes("FROM PRODUCTOS") &&
        normalized.startsWith("SELECT")
      ) {
        const negocioId = Number(params[0]);
        return asResult(
          productos
            .filter((p) => p.negocio_id === negocioId)
            .map((p) => ({
              id: p.id,
              nombre: p.nombre,
              descripcion: p.descripcion,
              precioCentavos: p.precio_centavos,
              disponible: p.disponible,
            })),
        );
      }

      if (normalized.startsWith("UPDATE PRODUCTOS")) {
        const productoId = Number(params[0]);
        const negocioId = Number(params[1]);
        const item = productos.find(
          (p) => p.id === productoId && p.negocio_id === negocioId,
        );
        if (!item) return asResult([]);
        if (params[2] !== null && params[2] !== undefined) {
          item.nombre = String(params[2]);
        }
        if (params[3] !== null && params[3] !== undefined) {
          item.descripcion = String(params[3]);
        }
        if (params[4] !== null && params[4] !== undefined) {
          item.precio_centavos = Number(params[4]);
        }
        if (params[5] !== null && params[5] !== undefined) {
          item.disponible = Boolean(params[5]);
        }
        return asResult([
          {
            id: item.id,
            nombre: item.nombre,
            descripcion: item.descripcion,
            precioCentavos: item.precio_centavos,
            disponible: item.disponible,
          },
        ]);
      }

      return asResult([]);
    },
  );

  // 0. Seguridad en /api/auth/register:
  // 0.1 Rechaza intento de autoasignarse rol "dueno"
  const regDueno = await requestApp(app, "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: "Atacante Dueño",
      username: "atacante.dueno",
      correo: "atacante@ejemplo.com",
      rol: "dueno",
      codigoInvitacion: "MESA-CLARA-2026",
      password: "Password2026",
    }),
  });
  assert.equal(regDueno.status, 403);

  // 0.2 Rechaza intento de enviar negocioId desde el cliente
  const regNegocioArbitrario = await requestApp(app, "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: "Atacante Negocio",
      username: "atacante.negocio",
      correo: "atacante2@ejemplo.com",
      negocioId: 2,
      codigoInvitacion: "MESA-CLARA-2026",
      password: "Password2026",
    }),
  });
  assert.equal(regNegocioArbitrario.status, 403);

  // 0.3 Rechaza registro sin código de invitación o con código inválido
  const regSinCodigo = await requestApp(app, "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: "Sin Invitación",
      username: "sin.invitacion",
      correo: "sin@ejemplo.com",
      password: "Password2026",
    }),
  });
  assert.equal(regSinCodigo.status, 403);

  // 0.4 Permite registro con código de invitación válido y fuerza rol "empleado"
  const regValido = await requestApp(app, "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nombre: "Ana Torres",
      username: "ana.torres",
      correo: "ana.torres@mesaclara.mx",
      codigoInvitacion: "MESA-CLARA-2026",
      password: "Password2026",
    }),
  });
  assert.equal(regValido.status, 201);
  const regSetCookie = regValido.headers.get("set-cookie") ?? "";
  assert.equal(regSetCookie.includes("HttpOnly"), true);
  const usuarioCreado = await regValido.json();
  assert.equal(usuarioCreado.rol, "empleado");
  assert.equal(usuarioCreado.negocio.id, 1);
  assert.equal("sessionToken" in usuarioCreado, false);

  // 1. Sin sesión, /api/auth/me y /api/productos devuelven 401
  const meSinSesion = await requestApp(app, "/api/auth/me");
  assert.equal(meSinSesion.status, 401);

  const prodSinSesion = await requestApp(app, "/api/productos");
  assert.equal(prodSinSesion.status, 401);

  // 2. Iniciar sesión como dueña de Mesa Clara (lucia.garcia)
  const loginDuena = await requestApp(app, "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "lucia.garcia",
      password: "MesaClara2026",
      recordarme: true,
    }),
  });
  assert.equal(loginDuena.status, 200);
  const setCookieHeader = loginDuena.headers.get("set-cookie") ?? "";
  assert.equal(setCookieHeader.includes("HttpOnly"), true);
  const cookieDuena = setCookieHeader.split(";")[0];

  const datosDuena = await loginDuena.json();
  assert.equal(datosDuena.nombre, "Lucía García");
  assert.equal(datosDuena.rol, "dueno");
  assert.equal(datosDuena.negocio.id, 1);
  assert.equal(datosDuena.negocio.nombre, "Mesa Clara");
  assert.equal("sessionToken" in datosDuena, false);

  // 3. Consultar /api/auth/me con la cookie de sesión
  const meDuena = await requestApp(app, "/api/auth/me", {
    headers: { Cookie: cookieDuena },
  });
  assert.equal(meDuena.status, 200);
  const sesionDuena = await meDuena.json();
  assert.equal(sesionDuena.username, "lucia.garcia");
  assert.equal(sesionDuena.negocio.nombre, "Mesa Clara");

  // 4. Editar un producto de Mesa Clara (ID 1) y comprobar que persiste
  const patchDuena = await requestApp(app, "/api/productos/1", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieDuena,
    },
    body: JSON.stringify({
      nombre: "Chilaquiles Verdes Especiales",
      precioCentavos: 13500,
    }),
  });
  assert.equal(patchDuena.status, 200);
  const prodEditado = await patchDuena.json();
  assert.equal(prodEditado.nombre, "Chilaquiles Verdes Especiales");
  assert.equal(prodEditado.precioCentavos, 13500);

  // 5. Iniciar sesión como empleado de Mesa Clara (carlos.mendez)
  const loginEmpleado = await requestApp(app, "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "carlos.mendez",
      password: "MesaClara2026",
    }),
  });
  assert.equal(loginEmpleado.status, 200);
  const cookieEmpleado = (
    loginEmpleado.headers.get("set-cookie") ?? ""
  ).split(";")[0];

  // El empleado puede consultar los productos de Mesa Clara
  const getProdEmpleado = await requestApp(app, "/api/productos", {
    headers: { Cookie: cookieEmpleado },
  });
  assert.equal(getProdEmpleado.status, 200);
  const listaEmpleado = await getProdEmpleado.json();
  assert.equal(listaEmpleado[0].nombre, "Chilaquiles Verdes Especiales");

  // El empleado NO puede editar ni crear productos desde la API (403 Forbidden)
  const patchEmpleado = await requestApp(app, "/api/productos/1", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieEmpleado,
    },
    body: JSON.stringify({ nombre: "Intento no autorizado" }),
  });
  assert.equal(patchEmpleado.status, 403);

  const postEmpleado = await requestApp(app, "/api/productos", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieEmpleado,
    },
    body: JSON.stringify({
      nombre: "Nuevo platillo",
      descripcion: "Intento de empleado",
      precioCentavos: 9000,
    }),
  });
  assert.equal(postEmpleado.status, 403);

  // 6. Iniciar sesión como dueño de OTRO local (marco.silva -> Comedor Reforma, ID 2)
  const loginOtroDueno = await requestApp(app, "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "marco.silva",
      password: "Reforma2026",
    }),
  });
  assert.equal(loginOtroDueno.status, 200);
  const cookieOtroDueno = (
    loginOtroDueno.headers.get("set-cookie") ?? ""
  ).split(";")[0];

  // Intentar modificar el producto ID 1 (que pertenece a Mesa Clara) devuelve 404
  const patchOtroNegocio = await requestApp(app, "/api/productos/1", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieOtroDueno,
    },
    body: JSON.stringify({ nombre: "Cambio cruzado prohibido" }),
  });
  assert.equal(patchOtroNegocio.status, 404);

  // 7. Cerrar sesión de la dueña de Mesa Clara y comprobar pérdida de acceso
  const logoutRes = await requestApp(app, "/api/auth/logout", {
    method: "POST",
    headers: { Cookie: cookieDuena },
  });
  assert.equal(logoutRes.status, 200);

  const prodTrasLogout = await requestApp(app, "/api/productos", {
    headers: { Cookie: cookieDuena },
  });
  assert.equal(prodTrasLogout.status, 401);
});
