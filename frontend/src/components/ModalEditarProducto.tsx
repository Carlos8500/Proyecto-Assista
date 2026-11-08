import { useEffect, useRef, useState } from "react";
import FormularioProducto from "./FormularioProducto";
import type { DatosProducto } from "./FormularioProducto";

type Props = {
  producto: DatosProducto;
  onGuardar: (datos: DatosProducto) => Promise<void>;
  onCerrar: () => void;
};

export default function ModalEditarProducto({
  producto,
  onGuardar,
  onCerrar,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();

    return () => {
      dialog?.close();
    };
  }, []);

  async function guardar(datos: DatosProducto) {
    setGuardando(true);

    try {
      await onGuardar(datos);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal-producto"
      aria-labelledby="titulo-editar-producto"
      onCancel={(event) => {
        event.preventDefault();

        if (!guardando) {
          onCerrar();
        }
      }}
    >
      <h2 id="titulo-editar-producto">Editar producto</h2>

      <FormularioProducto
        valoresIniciales={producto}
        onGuardar={guardar}
        onCancelar={onCerrar}
      />
    </dialog>
  );
}
