import { useState } from "react";
import type { FormEvent } from "react";

export type DatosProducto = {
  nombre: string;
  descripcion: string;
  precioCentavos: number;
};

type Props = {
  valoresIniciales?: DatosProducto;
  onGuardar: (datos: DatosProducto) => Promise<void>;
  onCancelar: () => void;
  mostrarVistaPrevia?: boolean;
};

const formatoPrecio = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export default function FormularioProducto({
  valoresIniciales,
  onGuardar,
  onCancelar,
  mostrarVistaPrevia = false,
}: Props) {
  const [nombre, setNombre] = useState(valoresIniciales?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(
    valoresIniciales?.descripcion ?? "",
  );
  const [precio, setPrecio] = useState(
    valoresIniciales
      ? (valoresIniciales.precioCentavos / 100).toFixed(2)
      : "",
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const precioNormalizado = precio.trim().replace(",", ".");
  const formatoPrecioValido = /^\d+(\.\d{1,2})?$/.test(precioNormalizado);
  const [pesos, centavos = ""] = precioNormalizado.split(".");
  const precioCentavos =
    Number(pesos) * 100 + Number(centavos.padEnd(2, "0"));

  const precioValido =
    formatoPrecioValido &&
    Number.isInteger(precioCentavos) &&
    precioCentavos >= 1 &&
    precioCentavos <= 2_147_483_647;

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const nombreLimpio = nombre.trim();
    const descripcionLimpia = descripcion.trim();

    if (!nombreLimpio || !descripcionLimpia) {
      setError("Completa el nombre y la descripción.");
      return;
    }

    if (!formatoPrecioValido) {
      setError("Ingresa un precio con hasta dos decimales.");
      return;
    }

    if (!precioValido) {
      setError("Ingresa un precio válido mayor que cero.");
      return;
    }

    setGuardando(true);

    try {
      await onGuardar({
        nombre: nombreLimpio,
        descripcion: descripcionLimpia,
        precioCentavos,
      });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el producto.",
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className={mostrarVistaPrevia ? "producto-con-preview" : undefined}>
      <form onSubmit={enviar}>
        <fieldset disabled={guardando}>
          <legend>Datos del producto</legend>

          <p className="ayuda-formulario">
            Todos los campos son obligatorios.
          </p>

          <label htmlFor="producto-nombre">Nombre del producto</label>
          <input
            id="producto-nombre"
            value={nombre}
            onChange={(event) => setNombre(event.target.value)}
            maxLength={120}
            aria-describedby="ayuda-nombre"
            required
          />
          <p id="ayuda-nombre" className="ayuda-campo">
            Un nombre breve y fácil de reconocer.
          </p>

          <label htmlFor="producto-precio">Precio (MXN)</label>
          <input
            id="producto-precio"
            type="text"
            inputMode="decimal"
            placeholder="85.00"
            value={precio}
            onChange={(event) => setPrecio(event.target.value)}
            aria-describedby="ayuda-precio"
            required
          />
          <p id="ayuda-precio" className="ayuda-campo">
            Precio por unidad. Ingresa un valor mayor que cero.
          </p>

          <label htmlFor="producto-descripcion">Descripción</label>
          <textarea
            id="producto-descripcion"
            value={descripcion}
            onChange={(event) => setDescripcion(event.target.value)}
            maxLength={250}
            aria-describedby="ayuda-descripcion"
            required
          />
          <p id="ayuda-descripcion" className="ayuda-campo">
            Hasta 250 caracteres. {descripcion.length}/250
          </p>

          {error && <p role="alert">{error}</p>}

          <div className="acciones-formulario">
            <button type="button" onClick={onCancelar}>
              Cancelar
            </button>

            <button type="submit">
              {guardando
                ? "Guardando…"
                : valoresIniciales
                  ? "Guardar cambios"
                  : "＋ Agregar producto"}
            </button>
          </div>
        </fieldset>
      </form>

      {mostrarVistaPrevia && (
        <aside className="vista-previa" aria-label="Vista previa del producto">
          <p className="titulo-preview">Así aparecerá en tu menú</p>

          <article className="tarjeta-preview">
            <h2>{nombre.trim() || "Nombre del producto"}</h2>

            <p>
              {descripcion.trim() ||
                "La descripción de tu producto aparecerá aquí."}
            </p>

            <strong>
              {precioValido
                ? formatoPrecio.format(precioCentavos / 100)
                : "Ingresa un precio"}
            </strong>
          </article>

          <p className="nota-preview">
            Revisa los datos antes de agregar el producto.
          </p>
        </aside>
      )}
    </div>
  );
}
