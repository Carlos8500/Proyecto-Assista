import type { ReactNode } from "react";
import { formatearRol, obtenerIniciales } from "../types/auth";
import type { UsuarioAutenticado } from "../types/auth";

type Props = {
  nombreNegocio: string;
  usuario: UsuarioAutenticado;
  cerrandoSesion?: boolean;
  onCerrarSesion: () => void;
  children: ReactNode;
};

type IconoProps = {
  tipo: "menu" | "pedidos" | "calendario" | "salir";
};

function Icono({ tipo }: IconoProps) {
  const trazos = {
    menu: "M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4z M12 5v15",
    pedidos: "M9 4H6v17h12V4h-3 M9 3h6v4H9z M9 11h6 M9 15h6",
    calendario: "M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16",
    salir: "M10 4H4v16h6 M9 12h12 M17 8l4 4-4 4",
  };

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={trazos[tipo]} />
    </svg>
  );
}

export default function Layout({
  nombreNegocio,
  usuario,
  cerrandoSesion = false,
  onCerrarSesion,
  children,
}: Props) {
  const fecha = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Cancun",
  }).format(new Date());

  const negocioMostrado = nombreNegocio || usuario.negocio.nombre;

  return (
    <div className="app-layout">
      <aside className="barra-lateral">
        <div className="identidad-app">
          <span className="simbolo-marca">
            <Icono tipo="menu" />
          </span>
          <div>
            <div className="marca">Assista</div>
            <p className="nombre-negocio">
              {negocioMostrado || "Cargando negocio…"}
            </p>
          </div>
        </div>

        <nav aria-label="Espacio de trabajo">
          <p className="etiqueta-navegacion">Espacio de trabajo</p>

          <button
            className="enlace-menu opcion-pendiente"
            type="button"
            disabled
            title="Disponible en una próxima entrega"
          >
            <Icono tipo="pedidos" />
            Pedidos
          </button>

          <a className="enlace-menu activo" href="/" aria-current="page">
            <Icono tipo="menu" />
            Administrar menú
          </a>
        </nav>

        <footer className="pie-lateral">
          <div className="usuario-demo">
            <span className="avatar-usuario">
              {obtenerIniciales(usuario.nombre)}
            </span>
            <div>
              <strong>{usuario.nombre}</strong>
              <span>
                {formatearRol(usuario.rol)} · {negocioMostrado}
              </span>
            </div>
          </div>

          <button
            className="enlace-menu boton-cerrar-sesion"
            type="button"
            disabled={cerrandoSesion}
            onClick={onCerrarSesion}
          >
            <Icono tipo="salir" />
            {cerrandoSesion ? "Cerrando sesión…" : "Cerrar sesión"}
          </button>
        </footer>
      </aside>

      <div className="contenido-app">
        <header className="barra-superior">
          <span>{negocioMostrado || "Assista"} / Administrar menú</span>

          <span className="fecha-actual">
            <Icono tipo="calendario" />
            {fecha}
          </span>
        </header>

        {children}
      </div>
    </div>
  );
}

