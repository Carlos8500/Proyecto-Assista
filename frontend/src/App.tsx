import { useEffect, useState } from "react";
import FormularioProducto from "./components/FormularioProducto";
import type { DatosProducto } from "./components/FormularioProducto";
import Layout from "./components/Layout";
import ModalEditarProducto from "./components/ModalEditarProducto";

type Producto = {
  id: number;
  nombre: string;
  descripcion: string;
  precioCentavos: number;
  disponible: boolean;
};

const formatoPrecio = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export default function App() {
  const [productos, setProductos] = useState<Producto[] | null>(null);
  const [error, setError] = useState("");
  const [actualizandoId, setActualizandoId] = useState<number | null>(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [productoEditando, setProductoEditando] = useState<Producto | null>(
    null,
  );
  const [nombreNegocio, setNombreNegocio] = useState("");

  useEffect(() => {
    async function cargarNegocio() {
      try {
        const respuesta = await fetch("/api/negocio");

        if (!respuesta.ok) {
          throw new Error("No se pudo consultar el negocio");
        }

        const negocio: { id: number; nombre: string } = await respuesta.json();
        setNombreNegocio(negocio.nombre);
      } catch {
        setNombreNegocio("");
      }
    }

    void cargarNegocio();
  }, []);

  useEffect(() => {
    async function cargarProductos() {
      try {
        const respuesta = await fetch("/api/productos");

        if (!respuesta.ok) {
          throw new Error("No se pudo cargar el menú");
        }

        const datos: Producto[] = await respuesta.json();
        setProductos(datos);
      } catch {
        setError("No se pudieron cargar los productos.");
      }
    }

    void cargarProductos();
  }, []);

  async function cambiarDisponibilidad(producto: Producto) {
    setActualizandoId(producto.id);
    setError("");

    try {
      const respuesta = await fetch(`/api/productos/${producto.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          disponible: !producto.disponible,
        }),
      });

      if (!respuesta.ok) {
        throw new Error("No se pudo actualizar la disponibilidad");
      }

      const actualizado: Producto = await respuesta.json();

      setProductos((actuales) =>
        actuales === null
          ? null
          : actuales.map((item) =>
              item.id === actualizado.id ? actualizado : item,
            ),
      );
    } catch {
      setError("No se pudo actualizar la disponibilidad. Intenta de nuevo.");
    } finally {
      setActualizandoId(null);
    }
  }

  async function agregarProducto(datos: DatosProducto) {
    const respuesta = await fetch("/api/productos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(datos),
    });

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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(datos),
    });

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

  if (mostrarFormulario) {
    return (
      <Layout nombreNegocio={nombreNegocio}>
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
    <Layout nombreNegocio={nombreNegocio}>

      {productoEditando && (
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
              {nombreNegocio ? `La carta de ${nombreNegocio}` : "Administrar menú"}
            </h1>

            <p className="descripcion-seccion">
              Consulta tus productos y agrega nuevas propuestas a la carta.
            </p>
          </div>

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
        </div>

        <div className="resumen-menu">
          <span>
            {productos === null
              ? "Cargando productos…"
              : `${productos.length} ${
                  productos.length === 1 ? "producto" : "productos"
                }`}
          </span>

          <span className="nota-permisos">Administración del negocio</span>
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
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((producto) => (
                <tr key={producto.id}>
                  <td>{producto.nombre}</td>
                  <td>{producto.descripcion}</td>
                  <td>{formatoPrecio.format(producto.precioCentavos / 100)}</td>
                  <td>{producto.disponible ? "Disponible" : "Agotado"}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="nota-menu">
          Los productos disponibles podrán ofrecerse al recibir pedidos del negocio.
        </p>
      </main>
    </Layout>
  );
}
