import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

export type EstadoPedido =
  | "pendiente"
  | "en_preparacion"
  | "listo"
  | "entregado"
  | "cancelado";

export type TipoEntrega = "recoger" | "domicilio";
export type OrigenPedido = "telefono_ia" | "manual";

export type ItemPedido = {
  id: number;
  productoId: number | null;
  nombre: string;
  cantidad: number;
  precioUnitarioCentavos: number;
  notas: string | null;
};

export type Pedido = {
  id: number;
  clienteNombre: string;
  clienteTelefono: string | null;
  tipoEntrega: TipoEntrega;
  direccionEntrega: string | null;
  estado: EstadoPedido;
  totalCentavos: number;
  notas: string | null;
  origen: OrigenPedido;
  creadoEn: string;
  actualizadoEn: string;
  items: ItemPedido[];
};

type ProductoDisponible = {
  id: number;
  nombre: string;
  precioCentavos: number;
  disponible: boolean;
};

type Props = {
  nombreNegocio: string;
  productos: ProductoDisponible[];
  onSesionExpirada: () => void;
};

const formatoPrecio = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  pendiente: "Pendiente",
  en_preparacion: "En preparación",
  listo: "Listo para entregar",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

const SIGUIENTE_ESTADO: Partial<
  Record<EstadoPedido, { estado: EstadoPedido; etiqueta: string }>
> = {
  pendiente: { estado: "en_preparacion", etiqueta: "Iniciar preparación" },
  en_preparacion: { estado: "listo", etiqueta: "Marcar listo" },
  listo: { estado: "entregado", etiqueta: "Marcar entregado" },
};

export default function VistaPedidos({
  nombreNegocio,
  productos,
  onSesionExpirada,
}: Props) {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [filtro, setFiltro] = useState<"activos" | "todos" | EstadoPedido>(
    "activos",
  );
  const [error, setError] = useState("");
  const [actualizandoId, setActualizandoId] = useState<number | null>(null);

  // Estado para alta manual de pedido
  const [mostrarNuevoPedido, setMostrarNuevoPedido] = useState(false);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>("recoger");
  const [direccionEntrega, setDireccionEntrega] = useState("");
  const [notasPedido, setNotasPedido] = useState("");
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [guardandoManual, setGuardandoManual] = useState(false);

  const cargarPedidos = useCallback(async () => {
    try {
      const respuesta = await fetch("/api/pedidos?limite=100", {
        credentials: "include",
      });

      if (respuesta.status === 401) {
        onSesionExpirada();
        return;
      }

      if (!respuesta.ok) {
        throw new Error("No se pudieron cargar los pedidos.");
      }

      const datos: Pedido[] = await respuesta.json();
      setPedidos(datos);
    } catch {
      setError("No se pudieron cargar los pedidos.");
    }
  }, [onSesionExpirada]);

  useEffect(() => {
    void cargarPedidos();
    const intervalo = window.setInterval(() => {
      void cargarPedidos();
    }, 8000);
    return () => window.clearInterval(intervalo);
  }, [cargarPedidos]);

  async function cambiarEstadoPedido(
    pedidoId: number,
    nuevoEstado: EstadoPedido,
  ) {
    setActualizandoId(pedidoId);
    setError("");
    try {
      const respuesta = await fetch(`/api/pedidos/${pedidoId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevoEstado }),
      });

      if (respuesta.status === 401) {
        onSesionExpirada();
        return;
      }

      if (!respuesta.ok) {
        const detalle = await respuesta.json().catch(() => null);
        throw new Error(
          detalle?.message ?? "No se pudo actualizar el estado del pedido.",
        );
      }

      await cargarPedidos();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el pedido.",
      );
    } finally {
      setActualizandoId(null);
    }
  }

  async function crearPedidoManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const itemsSeleccionados = Object.entries(cantidades)
      .map(([id, cantidad]) => ({
        productoId: Number(id),
        cantidad,
      }))
      .filter((item) => item.cantidad > 0);

    if (!clienteNombre.trim()) {
      setError("Ingresa el nombre del cliente.");
      return;
    }

    if (itemsSeleccionados.length === 0) {
      setError("Selecciona al menos un producto disponible.");
      return;
    }

    if (tipoEntrega === "domicilio" && !direccionEntrega.trim()) {
      setError("Ingresa la dirección para entrega a domicilio.");
      return;
    }

    setGuardandoManual(true);
    try {
      const respuesta = await fetch("/api/pedidos", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteNombre: clienteNombre.trim(),
          clienteTelefono: clienteTelefono.trim() || null,
          tipoEntrega,
          direccionEntrega:
            tipoEntrega === "domicilio" ? direccionEntrega.trim() : null,
          notas: notasPedido.trim() || null,
          items: itemsSeleccionados,
        }),
      });

      if (respuesta.status === 401) {
        onSesionExpirada();
        return;
      }

      const datos = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        throw new Error(datos?.message ?? "No se pudo registrar el pedido.");
      }

      setClienteNombre("");
      setClienteTelefono("");
      setTipoEntrega("recoger");
      setDireccionEntrega("");
      setNotasPedido("");
      setCantidades({});
      setMostrarNuevoPedido(false);
      await cargarPedidos();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo registrar el pedido.",
      );
    } finally {
      setGuardandoManual(false);
    }
  }

  const productosDisponibles = productos.filter((p) => p.disponible);

  const pedidosFiltrados = (pedidos ?? []).filter((pedido) => {
    if (filtro === "todos") return true;
    if (filtro === "activos") {
      return (
        pedido.estado === "pendiente" ||
        pedido.estado === "en_preparacion" ||
        pedido.estado === "listo"
      );
    }
    return pedido.estado === filtro;
  });

  return (
    <main>
      <div className="cabecera-menu">
        <div>
          <p className="etiqueta-seccion">Recepción y cocina</p>
          <h1>
            {nombreNegocio ? `Pedidos de ${nombreNegocio}` : "Pedidos"}
          </h1>
          <p className="descripcion-seccion">
            Órdenes recibidas por el asistente telefónico de IA y en mostrador.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setError("");
            setMostrarNuevoPedido((prev) => !prev);
          }}
        >
          {mostrarNuevoPedido ? "Cerrar formulario" : "＋ Nuevo pedido manual"}
        </button>
      </div>

      {mostrarNuevoPedido && (
        <form className="formulario-pedido-manual" onSubmit={crearPedidoManual}>
          <fieldset disabled={guardandoManual}>
            <legend>Registrar pedido manual</legend>

            <div className="fila-campos-pedido">
              <div>
                <label htmlFor="pedido-cliente">Nombre del cliente</label>
                <input
                  id="pedido-cliente"
                  type="text"
                  placeholder="Sofía Hernández"
                  value={clienteNombre}
                  onChange={(e) => setClienteNombre(e.target.value)}
                  maxLength={120}
                  required
                />
              </div>

              <div>
                <label htmlFor="pedido-telefono">Teléfono (opcional)</label>
                <input
                  id="pedido-telefono"
                  type="tel"
                  placeholder="5512345678"
                  value={clienteTelefono}
                  onChange={(e) => setClienteTelefono(e.target.value)}
                  maxLength={20}
                />
              </div>
            </div>

            <div className="fila-campos-pedido">
              <div>
                <label htmlFor="pedido-entrega">Modalidad de entrega</label>
                <select
                  id="pedido-entrega"
                  className="select-assista"
                  value={tipoEntrega}
                  onChange={(e) =>
                    setTipoEntrega(e.target.value as TipoEntrega)
                  }
                >
                  <option value="recoger">Para recoger en local</option>
                  <option value="domicilio">Entrega a domicilio</option>
                </select>
              </div>

              {tipoEntrega === "domicilio" && (
                <div>
                  <label htmlFor="pedido-direccion">Dirección de entrega</label>
                  <input
                    id="pedido-direccion"
                    type="text"
                    placeholder="Calle, número y colonia"
                    value={direccionEntrega}
                    onChange={(e) => setDireccionEntrega(e.target.value)}
                    maxLength={250}
                    required
                  />
                </div>
              )}
            </div>

            <label>Platillos disponibles</label>
            {productosDisponibles.length === 0 ? (
              <p className="ayuda-campo">
                No hay platillos disponibles en el menú actualmente.
              </p>
            ) : (
              <div className="selector-productos-pedido">
                {productosDisponibles.map((prod) => {
                  const cant = cantidades[prod.id] ?? 0;
                  return (
                    <div key={prod.id} className="item-selector-producto">
                      <div>
                        <strong>{prod.nombre}</strong>
                        <span>
                          {formatoPrecio.format(prod.precioCentavos / 100)}
                        </span>
                      </div>
                      <div className="controles-cantidad">
                        <button
                          type="button"
                          onClick={() =>
                            setCantidades((prev) => ({
                              ...prev,
                              [prod.id]: Math.max(0, (prev[prod.id] ?? 0) - 1),
                            }))
                          }
                        >
                          −
                        </button>
                        <span>{cant}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setCantidades((prev) => ({
                              ...prev,
                              [prod.id]: Math.min(50, (prev[prod.id] ?? 0) + 1),
                            }))
                          }
                        >
                          ＋
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <label htmlFor="pedido-notas">Notas del pedido (opcional)</label>
            <input
              id="pedido-notas"
              type="text"
              placeholder="Ej. Sin cebolla, salsa aparte"
              value={notasPedido}
              onChange={(e) => setNotasPedido(e.target.value)}
              maxLength={500}
            />

            <div className="acciones-formulario">
              <button
                type="button"
                onClick={() => setMostrarNuevoPedido(false)}
              >
                Cancelar
              </button>
              <button type="submit">
                {guardandoManual ? "Registrando…" : "Guardar pedido"}
              </button>
            </div>
          </fieldset>
        </form>
      )}

      <div className="resumen-menu filtros-pedidos">
        <div className="botones-filtro-pedidos">
          {(
            [
              ["activos", "Activos"],
              ["pendiente", "Pendientes"],
              ["en_preparacion", "En preparación"],
              ["listo", "Listos"],
              ["entregado", "Entregados"],
              ["todos", "Todos"],
            ] as const
          ).map(([clave, etiqueta]) => (
            <button
              key={clave}
              type="button"
              className={`boton-filtro-pedido ${
                filtro === clave ? "activo" : ""
              }`}
              onClick={() => setFiltro(clave)}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        <span>
          {pedidos === null
            ? "Cargando pedidos…"
            : `${pedidosFiltrados.length} ${
                pedidosFiltrados.length === 1 ? "pedido" : "pedidos"
              }`}
        </span>
      </div>

      {error && <p role="alert">{error}</p>}
      {!error && pedidos === null && <p>Cargando pedidos…</p>}
      {pedidos !== null && pedidosFiltrados.length === 0 && (
        <p>No hay pedidos en esta vista por el momento.</p>
      )}

      {pedidosFiltrados.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Folio / Origen</th>
              <th>Cliente y entrega</th>
              <th>Platillos</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pedidosFiltrados.map((pedido) => {
              const siguiente = SIGUIENTE_ESTADO[pedido.estado];
              const puedeCancelar =
                pedido.estado === "pendiente" ||
                pedido.estado === "en_preparacion" ||
                pedido.estado === "listo";

              return (
                <tr key={pedido.id}>
                  <td>
                    <strong>#{pedido.id}</strong>
                    <div className="detalle-celda-pedido">
                      {pedido.origen === "telefono_ia"
                        ? "📞 Teléfono IA"
                        : "🏪 Mostrador"}
                    </div>
                  </td>
                  <td>
                    <strong>{pedido.clienteNombre}</strong>
                    {pedido.clienteTelefono && (
                      <div className="detalle-celda-pedido">
                        Tel: {pedido.clienteTelefono}
                      </div>
                    )}
                    <div className="detalle-celda-pedido">
                      {pedido.tipoEntrega === "domicilio"
                        ? `🛵 Domicilio: ${pedido.direccionEntrega ?? ""}`
                        : "🛍️ Para recoger"}
                    </div>
                    {pedido.notas && (
                      <div className="detalle-celda-pedido">
                        Nota: {pedido.notas}
                      </div>
                    )}
                  </td>
                  <td>
                    <ul className="lista-items-pedido">
                      {pedido.items.map((item) => (
                        <li key={item.id}>
                          <strong>{item.cantidad}×</strong> {item.nombre}
                          {item.notas ? ` (${item.notas})` : ""}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    <strong>
                      {formatoPrecio.format(pedido.totalCentavos / 100)}
                    </strong>
                  </td>
                  <td>{ETIQUETA_ESTADO[pedido.estado]}</td>
                  <td>
                    {siguiente && (
                      <button
                        type="button"
                        disabled={actualizandoId !== null}
                        onClick={() =>
                          cambiarEstadoPedido(pedido.id, siguiente.estado)
                        }
                      >
                        {actualizandoId === pedido.id
                          ? "Actualizando…"
                          : siguiente.etiqueta}
                      </button>
                    )}
                    {puedeCancelar && (
                      <button
                        type="button"
                        disabled={actualizandoId !== null}
                        onClick={() =>
                          cambiarEstadoPedido(pedido.id, "cancelado")
                        }
                      >
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
