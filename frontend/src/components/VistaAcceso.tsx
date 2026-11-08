import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { RolUsuario, UsuarioAutenticado } from "../types/auth";

type Props = {
  onAutenticado: (usuario: UsuarioAutenticado, recordar: boolean) => void;
};

function IconoOjo({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c6.5 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3.5 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    </svg>
  );
}

function IconoCubiertos() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 3v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3" />
      <path d="M8 3v18" />
      <path d="M16 3v18" />
      <path d="M19 3v6a3 3 0 0 1-3 3" />
    </svg>
  );
}

function IconoDetalle() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 7.5a2.5 2.5 0 0 1 5 0c0 2.5-5 5.5-5 5.5s-5-3-5-5.5a2.5 2.5 0 0 1 5 0Z" />
      <path d="M3 16.5h4l3 2h7a2 2 0 0 0 2-2v-.5a1.5 1.5 0 0 0-1.5-1.5H12l-2.5-1.5H3v3.5Z" />
    </svg>
  );
}

export default function VistaAcceso({ onAutenticado }: Props) {
  const [modo, setModo] = useState<"login" | "registro">("login");

  // Estado Login
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [mostrarLoginPassword, setMostrarLoginPassword] = useState(false);
  const [recordarme, setRecordarme] = useState(true);
  const [mostrarAyudaClave, setMostrarAyudaClave] = useState(false);

  // Estado Registro
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [correo, setCorreo] = useState("");
  const [rol, setRol] = useState<RolUsuario>("empleado");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmar, setRegConfirmar] = useState("");
  const [mostrarRegPassword, setMostrarRegPassword] = useState(false);
  const [mostrarRegConfirmar, setMostrarRegConfirmar] = useState(false);
  const [estadoUsername, setEstadoUsername] = useState<
    "vacio" | "verificando" | "disponible" | "ocupado" | "invalido"
  >("vacio");

  // Estado compartido
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (modo !== "registro") return;
    const limpio = regUsername.trim().toLowerCase();
    if (!limpio) {
      setEstadoUsername("vacio");
      return;
    }
    if (!/^[a-z0-9._-]{3,60}$/.test(limpio)) {
      setEstadoUsername("invalido");
      return;
    }

    setEstadoUsername("verificando");
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/auth/check-username?username=${encodeURIComponent(limpio)}`,
        );
        if (!res.ok) {
          setEstadoUsername("vacio");
          return;
        }
        const data: { disponible: boolean; valido: boolean } = await res.json();
        if (!data.valido) {
          setEstadoUsername("invalido");
        } else {
          setEstadoUsername(data.disponible ? "disponible" : "ocupado");
        }
      } catch {
        setEstadoUsername("vacio");
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [regUsername, modo]);

  const reqMinimoOcho = regPassword.length >= 8;
  const reqMayuscula = /[A-ZÁÉÍÓÚÑ]/.test(regPassword);
  const reqNumero = /\d/.test(regPassword);
  const reqCoinciden =
    regPassword.length > 0 && regPassword === regConfirmar;

  async function enviarLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const usuarioLimpio = loginUsername.trim();
    if (!usuarioLimpio || !loginPassword) {
      setError("Ingresa tu nombre de usuario y contraseña.");
      return;
    }

    setCargando(true);
    try {
      const respuesta = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: usuarioLimpio,
          password: loginPassword,
          recordarme,
        }),
      });

      const datos = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        throw new Error(
          datos?.message ?? "No se pudo iniciar sesión. Verifica tus datos.",
        );
      }

      onAutenticado(datos as UsuarioAutenticado, recordarme);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo iniciar sesión. Intenta de nuevo.",
      );
    } finally {
      setCargando(false);
    }
  }

  async function enviarRegistro(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const nombreLimpio = nombreCompleto.trim();
    const usernameLimpio = regUsername.trim().toLowerCase();
    const correoLimpio = correo.trim().toLowerCase();

    if (!nombreLimpio || !usernameLimpio || !correoLimpio) {
      setError("Completa tu nombre, usuario y correo electrónico.");
      return;
    }

    if (!reqMinimoOcho || !reqMayuscula || !reqNumero) {
      setError(
        "La contraseña debe cumplir con mínimo 8 caracteres, una mayúscula y un número.",
      );
      return;
    }

    if (!reqCoinciden) {
      setError("Las contraseñas ingresadas no coinciden.");
      return;
    }

    setCargando(true);
    try {
      const respuesta = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          nombre: nombreLimpio,
          username: usernameLimpio,
          correo: correoLimpio,
          rol,
          password: regPassword,
        }),
      });

      const datos = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        throw new Error(datos?.message ?? "No se pudo crear la cuenta.");
      }

      onAutenticado(datos as UsuarioAutenticado, true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo crear la cuenta.",
      );
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="acceso-layout">
      <aside className="panel-marca-acceso">
        <div className="marca-acceso-superior">
          <span className="icono-marca-acceso">
            <IconoCubiertos />
          </span>
          <span className="texto-marca-acceso">mesa clara</span>
        </div>

        <div className="hero-marca-acceso">
          <h2>
            El buen servicio
            <br />
            empieza con
            <br />
            orden.
          </h2>
          <p>
            Un espacio sencillo para cuidar cada pedido, desde la cocina hasta
            la mesa.
          </p>
        </div>

        <div className="pie-marca-acceso">
          <div className="lema-detalle-acceso">
            <IconoDetalle />
            <span>Hecho para quienes cuidan los detalles.</span>
          </div>
          <p className="subtitulo-marca-acceso">
            MESA CLARA · COCINA DE TODOS LOS DÍAS
          </p>
        </div>
      </aside>

      <section className="panel-formulario-acceso">
        {modo === "login" ? (
          <div className="contenedor-acceso">
            <button
              type="button"
              className="enlace-volver-inicio"
              onClick={() => {
                setError("");
                setMostrarAyudaClave(false);
                setLoginUsername("");
                setLoginPassword("");
              }}
            >
              <span aria-hidden="true">← </span>Volver al inicio
            </button>

            <p className="etiqueta-seccion">ACCESO DEL EQUIPO</p>
            <h1 className="titulo-acceso">Qué gusto verte de nuevo.</h1>
            <p className="subtitulo-acceso">
              Ingresa con tu nombre de usuario y contraseña.
            </p>

            <form
              className="formulario-acceso"
              onSubmit={enviarLogin}
              noValidate
            >
              <fieldset disabled={cargando}>
                <label htmlFor="login-username">Nombre de usuario</label>
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  placeholder="lucia.garcia"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  required
                />

                <label htmlFor="login-password">Contraseña</label>
                <div className="campo-password">
                  <input
                    id="login-password"
                    type={mostrarLoginPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="boton-icono-password"
                    aria-label={
                      mostrarLoginPassword
                        ? "Ocultar contraseña"
                        : "Mostrar contraseña"
                    }
                    onClick={() => setMostrarLoginPassword((v) => !v)}
                  >
                    <IconoOjo visible={mostrarLoginPassword} />
                  </button>
                </div>
                <p className="ayuda-campo-acceso">
                  Usa el icono para mostrar u ocultar la contraseña.
                </p>

                <div className="fila-opciones-login">
                  <label className="etiqueta-checkbox">
                    <input
                      type="checkbox"
                      checked={recordarme}
                      onChange={(e) => setRecordarme(e.target.checked)}
                    />
                    <span>Recordarme</span>
                  </label>

                  <button
                    type="button"
                    className="enlace-texto-acceso"
                    onClick={() => setMostrarAyudaClave((prev) => !prev)}
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>

                {mostrarAyudaClave && (
                  <div className="aviso-recuperacion" role="status">
                    Solicita al dueño del negocio restablecer tu acceso.
                  </div>
                )}

                {error && <p role="alert">{error}</p>}

                <button type="submit" className="boton-primario-acceso">
                  {cargando ? "Iniciando sesión…" : "Iniciar sesión"}
                </button>
              </fieldset>
            </form>

            <div className="pie-cambio-acceso">
              <span>¿Aún no tienes cuenta? </span>
              <button
                type="button"
                className="enlace-texto-acceso negrita"
                onClick={() => {
                  setError("");
                  setModo("registro");
                }}
              >
                Crear cuenta
              </button>
            </div>
          </div>
        ) : (
          <div className="contenedor-acceso contenedor-registro">
            <p className="etiqueta-seccion">NUEVO EN MESA CLARA</p>
            <h1 className="titulo-acceso">Crea tu cuenta</h1>
            <p className="subtitulo-acceso">
              Completa tus datos. Después verificarás tu correo.
            </p>

            <form
              className="formulario-acceso"
              onSubmit={enviarRegistro}
              noValidate
            >
              <fieldset disabled={cargando}>
                <label htmlFor="registro-nombre">Nombre completo</label>
                <input
                  id="registro-nombre"
                  type="text"
                  placeholder="Lucía García"
                  value={nombreCompleto}
                  onChange={(e) => setNombreCompleto(e.target.value)}
                  maxLength={120}
                  required
                />

                <label htmlFor="registro-username">Nombre de usuario</label>
                <input
                  id="registro-username"
                  type="text"
                  placeholder="lucia.garcia"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  maxLength={60}
                  required
                />
                <p
                  className={`ayuda-campo-acceso ${
                    estadoUsername === "ocupado" || estadoUsername === "invalido"
                      ? "texto-error-campo"
                      : ""
                  }`}
                >
                  {estadoUsername === "disponible" &&
                    "✓ Usuario disponible. Cada nombre de usuario es único."}
                  {estadoUsername === "ocupado" &&
                    "✕ Ese nombre de usuario ya está ocupado."}
                  {estadoUsername === "invalido" &&
                    "Usa al menos 3 caracteres (letras, números, puntos o guiones)."}
                  {(estadoUsername === "vacio" ||
                    estadoUsername === "verificando") &&
                    "✓ Usuario disponible. Cada nombre de usuario es único."}
                </p>

                <label htmlFor="registro-correo">Correo electrónico</label>
                <input
                  id="registro-correo"
                  type="email"
                  placeholder="lucia.garcia@ejemplo.com"
                  value={correo}
                  onChange={(e) => setCorreo(e.target.value)}
                  maxLength={160}
                  required
                />
                <p className="ayuda-campo-acceso">
                  Solo para verificar tu cuenta y recuperar el acceso.
                </p>

                <label id="etiqueta-rol">Rol</label>
                <div
                  className="selector-rol-acceso"
                  role="radiogroup"
                  aria-labelledby="etiqueta-rol"
                >
                  <label
                    className={`opcion-rol-acceso ${
                      rol === "empleado" ? "seleccionado" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="rol-usuario"
                      value="empleado"
                      checked={rol === "empleado"}
                      onChange={() => setRol("empleado")}
                    />
                    <span>Empleado</span>
                  </label>

                  <label
                    className={`opcion-rol-acceso ${
                      rol === "dueno" ? "seleccionado" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="rol-usuario"
                      value="dueno"
                      checked={rol === "dueno"}
                      onChange={() => setRol("dueno")}
                    />
                    <span>Dueño</span>
                  </label>
                </div>
                <p className="ayuda-campo-acceso">
                  Empleado: consulta, toma y elimina pedidos con confirmación.
                  Dueño: además, administra el menú.
                </p>

                <div className="fila-passwords-registro">
                  <div>
                    <label htmlFor="registro-password">Contraseña</label>
                    <div className="campo-password">
                      <input
                        id="registro-password"
                        type={mostrarRegPassword ? "text" : "password"}
                        placeholder="••••••••••••"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        className="boton-icono-password"
                        aria-label={
                          mostrarRegPassword
                            ? "Ocultar contraseña"
                            : "Mostrar contraseña"
                        }
                        onClick={() => setMostrarRegPassword((v) => !v)}
                      >
                        <IconoOjo visible={mostrarRegPassword} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="registro-confirmar">
                      Confirmar contraseña
                    </label>
                    <div className="campo-password">
                      <input
                        id="registro-confirmar"
                        type={mostrarRegConfirmar ? "text" : "password"}
                        placeholder="••••••••••••"
                        value={regConfirmar}
                        onChange={(e) => setRegConfirmar(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        className="boton-icono-password"
                        aria-label={
                          mostrarRegConfirmar
                            ? "Ocultar confirmación de contraseña"
                            : "Mostrar confirmación de contraseña"
                        }
                        onClick={() => setMostrarRegConfirmar((v) => !v)}
                      >
                        <IconoOjo visible={mostrarRegConfirmar} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="requisitos-password" aria-live="polite">
                  <div className="fila-requisitos">
                    <span className={reqMinimoOcho ? "cumplido" : ""}>
                      ✓ Mínimo 8 caracteres
                    </span>
                    <span className={reqMayuscula ? "cumplido" : ""}>
                      ✓ Una mayúscula
                    </span>
                    <span className={reqNumero ? "cumplido" : ""}>
                      ✓ Un número
                    </span>
                  </div>
                  <div className="fila-requisitos">
                    <span className={reqCoinciden ? "cumplido" : ""}>
                      ✓ Las contraseñas coinciden
                    </span>
                  </div>
                </div>

                {error && <p role="alert">{error}</p>}

                <button type="submit" className="boton-primario-acceso">
                  {cargando
                    ? "Creando cuenta…"
                    : "Crear cuenta y verificar correo"}
                </button>
              </fieldset>
            </form>

            <div className="pie-cambio-acceso alineado-izquierda">
              <span>¿Ya tienes cuenta? </span>
              <button
                type="button"
                className="enlace-texto-acceso"
                onClick={() => {
                  setError("");
                  setModo("login");
                }}
              >
                Iniciar sesión
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
