import test from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
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

process.env.NODE_ENV = "test";

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

test("Integración completa: login, /api/auth/me, edición por dueño, bloqueo a empleado, aislamiento entre negocios y logout", async () => {
  const { app } = await import("./index.ts");

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Sin sesión, /api/auth/me y /api/productos devuelven 401
    const meSinSesion = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(meSinSesion.status, 401);

    const prodSinSesion = await fetch(`${baseUrl}/api/productos`);
    assert.equal(prodSinSesion.status, 401);

    // 2. Iniciar sesión como dueña de Mesa Clara (lucia.garcia)
    const loginDuena = await fetch(`${baseUrl}/api/auth/login`, {
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

    // 3. Consultar /api/auth/me con la cookie de sesión
    const meDuena = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookieDuena },
    });
    assert.equal(meDuena.status, 200);
    const sesionDuena = await meDuena.json();
    assert.equal(sesionDuena.username, "lucia.garcia");
    assert.equal(sesionDuena.negocio.nombre, "Mesa Clara");

    // 4. Editar un producto de Mesa Clara (ID 1) y comprobar que persiste
    const patchDuena = await fetch(`${baseUrl}/api/productos/1`, {
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
    const loginEmpleado = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "carlos.mendez",
        password: "MesaClara2026",
      }),
    });
    assert.equal(loginEmpleado.status, 200);
    const cookieEmpleado = (loginEmpleado.headers.get("set-cookie") ?? "").split(";")[0];

    // El empleado puede consultar los productos de Mesa Clara
    const getProdEmpleado = await fetch(`${baseUrl}/api/productos`, {
      headers: { Cookie: cookieEmpleado },
    });
    assert.equal(getProdEmpleado.status, 200);
    const listaEmpleado = await getProdEmpleado.json();
    assert.equal(listaEmpleado[0].nombre, "Chilaquiles Verdes Especiales");

    // El empleado NO puede editar ni crear productos desde la API (403 Forbidden)
    const patchEmpleado = await fetch(`${baseUrl}/api/productos/1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieEmpleado,
      },
      body: JSON.stringify({ nombre: "Intento no autorizado" }),
    });
    assert.equal(patchEmpleado.status, 403);

    const postEmpleado = await fetch(`${baseUrl}/api/productos`, {
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
    const loginOtroDueno = await fetch(`${baseUrl}/api/auth/login`, {
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
    const patchOtroNegocio = await fetch(`${baseUrl}/api/productos/1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieOtroDueno,
      },
      body: JSON.stringify({ nombre: "Cambio cruzado prohibido" }),
    });
    assert.equal(patchOtroNegocio.status, 404);

    // 7. Cerrar sesión de la dueña de Mesa Clara y comprobar pérdida de acceso
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookieDuena },
    });
    assert.equal(logoutRes.status, 200);

    const prodTrasLogout = await fetch(`${baseUrl}/api/productos`, {
      headers: { Cookie: cookieDuena },
    });
    assert.equal(prodTrasLogout.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
