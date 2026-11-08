import { useEffect, useState } from "react";
import FormularioProducto from "./components/FormularioProducto";
import type { DatosProducto } from "./components/FormularioProducto";
import Layout from "./components/Layout";
import ModalEditarProducto from "./components/ModalEditarProducto";
import VistaAcceso from "./components/VistaAcceso";
import type { UsuarioAutenticado } from "./types/auth";

type Producto = {
  id: number;
  nombre: string;
  descripcion: string;
  precioCentavos: number;
  disponible: boolean;
};

const STORAGE_TOKEN_KEY = "assista_session_token";

function leerTokenRespaldo(): string | null {
  try {
    return (
      window.localStorage.getItem(STORAGE_TOKEN_KEY) ??
      window.sessionStorage.getItem(STORAGE_TOKEN_KEY)
    );
  } catch {
    return null;
  }
}

function guardarTokenRespaldo(token: string | undefined, recordar: boolean) {
  if (!token) return;
  try {
    if (recordar) {
      window.localStorage.setItem(STORAGE_TOKEN_KEY, token);
      window.sessionStorage.removeItem(STORAGE_TOKEN_KEY);
    } else {
      window.sessionStorage.setItem(STORAGE_TOKEN_KEY, token);
      window.localStorage.removeItem(STORAGE_TOKEN_KEY);
    }
  } catch {
    // Ignorar errores de almacenamiento privado
  }
}

function limpiarTokenRespaldo() {
  try {
    window.localStorage.removeItem(STORAGE_TOKEN_KEY);
    window.sessionStorage.removeItem(STORAGE_TOKEN_KEY);
  } catch {
    // Ignorar errores de almacenamiento privado
  }
}

function crearHeadersConSesion(conJson = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (conJson) {
    headers["Content-Type"] = "application/json";
  }
  const token = leerTokenRespaldo();
  if (token) {
    headers["x-session-token"] = token;
  }
  return headers;
}

const formatoPrecio = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export default function App() {
  const [usuario, setUsuario] = useState<UsuarioAutenticado | null>(null);
  const [verificandoSesion, setVerificandoSesion] = useState(true);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);

  const [productos, setProductos] = useState<Producto[] | null>(null);
  const [error, setError] = useState("");
  const [actualizandoId, setActualizandoId] = useState<number | null>(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [productoEditando, setProductoEditando] = useState<Producto | null>(
    null,
  );
  const [nombreNegocio, setNombreNegocio] = useState("");

  useEffect(() => {
    async function verificarSesionInicial() {
      try {
        const respuesta = await fetch("/api/auth/me?silent=1", {
          credentials: "include",
          headers: crearHeadersConSesion(),
        });

        if (!respuesta.ok) {
          limpiarTokenRespaldo();
          setUsuario(null);
          return;
        }

        const datos = await respuesta.json();
        if (datos && datos.autenticado === false) {
          limpiarTokenRespaldo();
          setUsuario(null);
          return;
        }

        const sesion = datos as UsuarioAutenticado;
        setUsuario(sesion);
        setNombreNegocio(sesion.negocio.nombre);
      } catch {
        setUsuario(null);
      } finally {
        setVerificandoSesion(false);
      }
    }

    void verificarSesionInicial();
  }, []);

  useEffect(() => {
    if (!usuario) {
      setProductos(null);
      setNombreNegocio("");
      return;
    }

    const usuarioActual = usuario;

    async function cargarDatosNegocio() {
      setError("");
      setProductos(null);

      try {
        const [resNegocio, resProductos] = await Promise.all([
          fetch("/api/negocio", {
            credentials: "include",
            headers: crearHeadersConSesion(),
          }),
          fetch("/api/productos", {
            credentials: "include",
            headers: crearHeadersConSesion(),
          }),
        ]);

        if (resNegocio.status === 401 || resProductos.status === 401) {
          limpiarTokenRespaldo();
          setUsuario(null);
          return;
        }

        if (resNegocio.ok) {
          const negocio: { id: number; nombre: string } =
            await resNegocio.json();
          setNombreNegocio(negocio.nombre);
        } else {
          setNombreNegocio(usuarioActual.negocio.nombre);
        }

        if (!resProductos.ok) {
          throw new Error("No se pudo cargar el menú");
        }

        const datosProductos: Producto[] = await resProductos.json();
        setProductos(datosProductos);
      } catch {
        setError("No se pudieron cargar los productos.");
      }
    }

    void cargarDatosNegocio();
  }, [usuario]);

  function manejarAutenticado(
    nuevoUsuario: UsuarioAutenticado,
    recordar: boolean,
  ) {
    guardarTokenRespaldo(nuevoUsuario.sessionToken, recordar);
    setMostrarFormulario(false);
    setProductoEditando(null);
    setError("");
    setNombreNegocio(nuevoUsuario.negocio.nombre);
    setUsuario(nuevoUsuario);
  }

  async function cerrarSesion() {
    setCerrandoSesion(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: crearHeadersConSesion(),
      });
    } catch {
      // Continuar cerrando sesión localmente
    } finally {
      limpiarTokenRespaldo();
      setCerrandoSesion(false);
      setMostrarFormulario(false);
      setProductoEditando(null);
      setProductos(null);
      setError("");
      setUsuario(null);
    }
  }

  async function cambiarDisponibilidad(producto: Producto) {
    setActualizandoId(producto.id);
    setError("");

    try {
      const respuesta = await fetch(`/api/productos/${producto.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: crearHeadersConSesion(true),
        body: JSON.stringify({
          disponible: !producto.disponible,
        }),
      });

      if (respuesta.status === 401) {
        limpiarTokenRespaldo();
        setUsuario(null);
        return;
      }

      if (!respuesta.ok) {
        const detalle = await respuesta.json().catch(() => null);
        throw new Error(
          detalle?.message ?? "No se pudo actualizar la disponibilidad",
        );
      }

      const actualizado: Producto = await respuesta.json();

      setProductos((actuales) =>
        actuales === null
          ? null
          : actuales.map((item) =>
              item.id === actualizado.id ? actualizado : item,
            ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar la disponibilidad. Intenta de nuevo.",
      );
    } finally {
      setActualizandoId(null);
    }
  }

  async function agregarProducto(datos: DatosProducto) {
    const respuesta = await fetch("/api/productos", {
      method: "POST",
      credentials: "include",
      headers: crearHeadersConSesion(true),
      body: JSON.stringify(datos),
    });

    if (respuesta.status === 401) {
      limpiarTokenRespaldo();
      setUsuario(null);
      return;
    }

    if (!respuesta.ok) {
      const detalle = await respuesta.json().catch(() => null);
      throw new Error(detalle?.message ?? "No se pudo agregar el producto.");
    }

    const nuevoProducto: Producto = await respuesta.json();

    setProductos((actuales) => [...(actuales ?? []), nuevoProducto]);
    setError("");
    setMostrarFormulario(false);
  }

  async function editarProducto(datos: DatosProducto) {
    if (!productoEditando) {
      throw new Error("Selecciona un producto para editar.");
    }

    const respuesta = await fetch(`/api/productos/${productoEditando.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: crearHeadersConSesion(true),
      body: JSON.stringify(datos),
    });

    if (respuesta.status === 401) {
      limpiarTokenRespaldo();
      setUsuario(null);
      return;
    }

    if (!respuesta.ok) {
      const detalle = await respuesta.json().catch(() => null);
      throw new Error(detalle?.message ?? "No se pudo editar el producto.");
    }

    const actualizado: Producto = await respuesta.json();

    setProductos((actuales) =>
      actuales === null
        ? null
        : actuales.map((producto) =>
            producto.id === actualizado.id ? actualizado : producto,
          ),
    );

    setError("");
    setProductoEditando(null);
  }

  if (verificandoSesion) {
    return (
      <div className="pantalla-cargando-sesion">
        <p>Verificando sesión en Assista…</p>
      </div>
    );
  }

  if (!usuario) {
    return <VistaAcceso onAutenticado={manejarAutenticado} />;
  }

  const esDueno = usuario.rol === "dueno";
  const negocioMostrado = nombreNegocio || usuario.negocio.nombre;

  if (mostrarFormulario && esDueno) {
    return (
      <Layout
        nombreNegocio={negocioMostrado}
        usuario={usuario}
        cerrandoSesion={cerrandoSesion}
        onCerrarSesion={cerrarSesion}
      >
        <main>
          <button
            className="boton-volver"
            type="button"
            onClick={() => setMostrarFormulario(false)}
          >
            <span aria-hidden="true">← </span>
            Administrar menú
          </button>

          <p className="etiqueta-seccion">Nuevo producto</p>
          <h1>Un nuevo sabor en la carta</h1>

          <p className="descripcion-seccion introduccion-producto">
            Agrega el nombre, el precio y una descripción clara para tu equipo.
          </p>

          <FormularioProducto
            mostrarVistaPrevia
            onGuardar={agregarProducto}
            onCancelar={() => setMostrarFormulario(false)}
          />
        </main>
      </Layout>
    );
  }

  return (
    <Layout
      nombreNegocio={negocioMostrado}
      usuario={usuario}
      cerrandoSesion={cerrandoSesion}
      onCerrarSesion={cerrarSesion}
    >
      {productoEditando && esDueno && (
        <ModalEditarProducto
          key={productoEditando.id}
          producto={productoEditando}
          onGuardar={editarProducto}
          onCerrar={() => setProductoEditando(null)}
        />
      )}
      <main>
        <div className="cabecera-menu">
          <div>
            <p className="etiqueta-seccion">Administración del menú</p>

            <h1>
              {negocioMostrado
                ? `La carta de ${negocioMostrado}`
                : "Administrar menú"}
            </h1>

            <p className="descripcion-seccion">
              {esDueno
                ? "Consulta tus productos y agrega nuevas propuestas a la carta."
                : "Consulta los platillos y su disponibilidad actual en la carta del local."}
            </p>
          </div>

          {esDueno && (
            <button
              type="button"
              disabled={productos === null || actualizandoId !== null}
              onClick={() => {
                setError("");
                setMostrarFormulario(true);
              }}
            >
              <span aria-hidden="true">＋ </span>
              Agregar producto
            </button>
          )}
        </div>

        <div className="resumen-menu">
          <span>
            {productos === null
              ? "Cargando productos…"
              : `${productos.length} ${
                  productos.length === 1 ? "producto" : "productos"
                }`}
          </span>

          <span className="nota-permisos">
            {esDueno
              ? "Administración del negocio · Dueño"
              : "Solo lectura · Empleado"}
          </span>
        </div>

        {error && <p role="alert">{error}</p>}
        {!error && productos === null && <p>Cargando menú…</p>}
        {productos?.length === 0 && <p>El menú aún no tiene productos.</p>}

        {productos && productos.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Descripción</th>
                <th>Precio (MXN)</th>
                <th>Disponibilidad</th>
                {esDueno && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {productos.map((producto) => (
                <tr key={producto.id}>
                  <td>{producto.nombre}</td>
                  <td>{producto.descripcion}</td>
                  <td>{formatoPrecio.format(producto.precioCentavos / 100)}</td>
                  <td>{producto.disponible ? "Disponible" : "Agotado"}</td>
                  {esDueno && (
                    <td>
                      <button
                        type="button"
                        disabled={actualizandoId !== null}
                        onClick={() => cambiarDisponibilidad(producto)}
                      >
                        {actualizandoId === producto.id
                          ? "Guardando…"
                          : producto.disponible
                            ? "Marcar agotado"
                            : "Habilitar"}
                      </button>
                      <button
                        type="button"
                        disabled={actualizandoId !== null}
                        onClick={() => {
                          setError("");
                          setProductoEditando(producto);
                        }}
                      >
                        Editar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="nota-menu">
          {esDueno
            ? "Los productos disponibles podrán ofrecerse al recibir pedidos del negocio."
            : "Como empleado puedes consultar la carta actualizada. Solo el dueño puede agregar o editar productos."}
        </p>
      </main>
    </Layout>
  );
}

