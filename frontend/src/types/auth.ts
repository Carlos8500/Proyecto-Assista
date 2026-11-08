export type RolUsuario = "dueno" | "empleado";

export type UsuarioAutenticado = {
  id: number;
  nombre: string;
  username: string;
  correo: string;
  rol: RolUsuario;
  negocio: {
    id: number;
    nombre: string;
  };
  sessionToken?: string;
};

export function obtenerIniciales(nombre: string): string {
  const partes = nombre
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (partes.length === 0) return "US";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}

export function formatearRol(rol: RolUsuario): string {
  return rol === "dueno" ? "Dueño" : "Empleado";
}
