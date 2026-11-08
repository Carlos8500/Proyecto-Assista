import "dotenv/config";
import { Pool } from "pg";
import { hashPassword } from "./auth.ts";
import type { RolUsuario } from "./auth.ts";

type NegocioRow = {
  id: number;
  nombre: string;
};

type ProductoRow = {
  id: number;
  negocio_id: number;
  nombre: string;
  descripcion: string;
  precio_centavos: number;
  disponible: boolean;
};

type UsuarioRow = {
  id: number;
  negocio_id: number;
  nombre: string;
  username: string;
  correo: string;
  password_hash: string;
  rol: RolUsuario;
};

type SesionRow = {
  token: string;
  usuario_id: number;
  expira_en: Date;
};

const negociosStore: NegocioRow[] = [
  { id: 1, nombre: "Mesa Clara" },
  { id: 2, nombre: "Comedor Reforma" },
];

const productosStore: ProductoRow[] = [
  {
    id: 1,
    negocio_id: 1,
    nombre: "Chilaquiles Verdes",
    descripcion:
      "Totopos crujientes bañados en salsa de tomatillo asado con crema, queso fresco y cebolla.",
    precio_centavos: 12500,
    disponible: true,
  },
  {
    id: 2,
    negocio_id: 1,
    nombre: "Enfrijoladas de la Casa",
    descripcion:
      "Tortillas rellenas de pollo deshebrado en salsa cremosa de frijol negro con aguacate.",
    precio_centavos: 13800,
    disponible: true,
  },
  {
    id: 3,
    negocio_id: 1,
    nombre: "Agua de Horchata Artesanal",
    descripcion:
      "Preparada diariamente con arroz, canela de Ceilán y un toque de vainilla.",
    precio_centavos: 4500,
    disponible: true,
  },
  {
    id: 4,
    negocio_id: 2,
    nombre: "Sopa Azteca Tradicional",
    descripcion:
      "Caldo de jitomate con chile pasilla, tiras de tortilla, aguacate y queso.",
    precio_centavos: 11000,
    disponible: true,
  },
];

let nextProductoId = 5;

const usuariosStore: UsuarioRow[] = [];
let nextUsuarioId = 1;
let seedPromise: Promise<void> | null = null;

const sesionesStore = new Map<string, SesionRow>();

async function ensureSeeded(): Promise<void> {
  if (usuariosStore.length > 0) return;
  if (seedPromise) {
    await seedPromise;
    return;
  }

  seedPromise = (async () => {
    const hashMesaClara = await hashPassword("MesaClara2026");
    const hashReforma = await hashPassword("Reforma2026");

    if (usuariosStore.length === 0) {
      usuariosStore.push(
        {
          id: nextUsuarioId++,
          negocio_id: 1,
          nombre: "Lucía García",
          username: "lucia.garcia",
          correo: "lucia.garcia@mesaclara.mx",
          password_hash: hashMesaClara,
          rol: "dueno",
        },
        {
          id: nextUsuarioId++,
          negocio_id: 1,
          nombre: "Carlos Méndez",
          username: "carlos.mendez",
          correo: "carlos.mendez@mesaclara.mx",
          password_hash: hashMesaClara,
          rol: "empleado",
        },
        {
          id: nextUsuarioId++,
          negocio_id: 2,
          nombre: "Marco Silva",
          username: "marco.silva",
          correo: "marco.silva@comedorreforma.mx",
          password_hash: hashReforma,
          rol: "dueno",
        },
      );
    }
  })();

  await seedPromise;
}

async function mockQuery(
  sql: string,
  params: unknown[] = [],
): Promise<{ rows: Record<string, unknown>[] }> {
  await ensureSeeded();
  const normalized = sql.replace(/\s+/g, " ").trim().toUpperCase();

  // 1. Consulta de negocio por ID
  if (normalized.startsWith("SELECT ID, NOMBRE FROM NEGOCIOS")) {
    const id = Number(params[0]);
    const rows = negociosStore
      .filter((n) => n.id === id)
      .map((n) => ({ id: n.id, nombre: n.nombre }));
    return { rows };
  }

  // 2. Consulta de usuario para login (por username o correo)
  if (
    normalized.includes("FROM USUARIOS U") &&
    normalized.includes("JOIN NEGOCIOS N") &&
    (normalized.includes("LOWER(U.USERNAME) = LOWER($1)") ||
      normalized.includes("LOWER(U.CORREO) = LOWER($1)"))
  ) {
    const identificador = String(params[0] ?? "")
      .trim()
      .toLowerCase();
    const usuario = usuariosStore.find(
      (u) =>
        u.username.toLowerCase() === identificador ||
        u.correo.toLowerCase() === identificador,
    );
    if (!usuario) {
      return { rows: [] };
    }
    const negocio = negociosStore.find((n) => n.id === usuario.negocio_id);
    if (!negocio) {
      return { rows: [] };
    }

    return {
      rows: [
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
      ],
    };
  }

  // 3. Verificar disponibilidad de username o correo
  if (normalized.startsWith("SELECT ID, USERNAME, CORREO FROM USUARIOS")) {
    const username = String(params[0] ?? "")
      .trim()
      .toLowerCase();
    const correo = String(params[1] ?? "")
      .trim()
      .toLowerCase();
    const rows = usuariosStore
      .filter(
        (u) =>
          u.username.toLowerCase() === username ||
          (correo !== "" && u.correo.toLowerCase() === correo),
      )
      .map((u) => ({
        id: u.id,
        username: u.username,
        correo: u.correo,
      }));
    return { rows };
  }

  // 4. Insertar nuevo usuario
  if (normalized.startsWith("INSERT INTO USUARIOS")) {
    const negocioId = Number(params[0]);
    const nombre = String(params[1]);
    const username = String(params[2]).toLowerCase();
    const correo = String(params[3]).toLowerCase();
    const passwordHash = String(params[4]);
    const rol = params[5] as RolUsuario;

    const duplicado = usuariosStore.find(
      (u) =>
        u.username.toLowerCase() === username ||
        u.correo.toLowerCase() === correo,
    );
    if (duplicado) {
      const error = new Error("El usuario o correo ya está registrado") as Error & {
        code?: string;
      };
      error.code = "23505";
      throw error;
    }

    const nuevo: UsuarioRow = {
      id: nextUsuarioId++,
      negocio_id: negocioId,
      nombre,
      username,
      correo,
      password_hash: passwordHash,
      rol,
    };
    usuariosStore.push(nuevo);

    return {
      rows: [
        {
          id: nuevo.id,
          negocioId: nuevo.negocio_id,
          nombre: nuevo.nombre,
          username: nuevo.username,
          correo: nuevo.correo,
          rol: nuevo.rol,
        },
      ],
    };
  }

  // 5. Insertar sesión
  if (normalized.startsWith("INSERT INTO SESIONES")) {
    const token = String(params[0]);
    const usuarioId = Number(params[1]);
    const expiraEn =
      params[2] instanceof Date ? params[2] : new Date(String(params[2]));

    sesionesStore.set(token, {
      token,
      usuario_id: usuarioId,
      expira_en: expiraEn,
    });
    return { rows: [{ token }] };
  }

  // 6. Consultar sesión activa (/api/auth/me y middleware)
  if (
    normalized.includes("FROM SESIONES S") &&
    normalized.includes("JOIN USUARIOS U")
  ) {
    const token = String(params[0] ?? "");
    const sesion = sesionesStore.get(token);
    if (!sesion) {
      return { rows: [] };
    }
    if (sesion.expira_en.getTime() <= Date.now()) {
      sesionesStore.delete(token);
      return { rows: [] };
    }
    const usuario = usuariosStore.find((u) => u.id === sesion.usuario_id);
    if (!usuario) {
      return { rows: [] };
    }
    const negocio = negociosStore.find((n) => n.id === usuario.negocio_id);
    if (!negocio) {
      return { rows: [] };
    }

    return {
      rows: [
        {
          id: usuario.id,
          nombre: usuario.nombre,
          username: usuario.username,
          correo: usuario.correo,
          rol: usuario.rol,
          negocioId: negocio.id,
          negocioNombre: negocio.nombre,
        },
      ],
    };
  }

  // 7. Eliminar sesión (logout)
  if (normalized.startsWith("DELETE FROM SESIONES")) {
    const token = String(params[0] ?? "");
    sesionesStore.delete(token);
    return { rows: [] };
  }

  // 8. Listar productos del negocio
  if (normalized.includes("FROM PRODUCTOS") && normalized.startsWith("SELECT")) {
    const negocioId = Number(params[0]);
    const rows = productosStore
      .filter((p) => p.negocio_id === negocioId)
      .sort((a, b) => a.id - b.id)
      .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        descripcion: p.descripcion,
        precioCentavos: p.precio_centavos,
        disponible: p.disponible,
      }));
    return { rows };
  }

  // 9. Crear producto
  if (normalized.startsWith("INSERT INTO PRODUCTOS")) {
    const negocioId = Number(params[0]);
    const nombre = String(params[1]);
    const descripcion = String(params[2]);
    const precioCentavos = Number(params[3]);

    const nuevo: ProductoRow = {
      id: nextProductoId++,
      negocio_id: negocioId,
      nombre,
      descripcion,
      precio_centavos: precioCentavos,
      disponible: true,
    };
    productosStore.push(nuevo);

    return {
      rows: [
        {
          id: nuevo.id,
          nombre: nuevo.nombre,
          descripcion: nuevo.descripcion,
          precioCentavos: nuevo.precio_centavos,
          disponible: nuevo.disponible,
        },
      ],
    };
  }

  // 10. Actualizar producto (filtrado por id Y negocio_id)
  if (normalized.startsWith("UPDATE PRODUCTOS")) {
    const productoId = Number(params[0]);
    const negocioId = Number(params[1]);
    const nombre = params[2] as string | null;
    const descripcion = params[3] as string | null;
    const precioCentavos = params[4] as number | null;
    const disponible = params[5] as boolean | null;

    const item = productosStore.find(
      (p) => p.id === productoId && p.negocio_id === negocioId,
    );

    if (!item) {
      return { rows: [] };
    }

    if (nombre !== null && nombre !== undefined) item.nombre = nombre;
    if (descripcion !== null && descripcion !== undefined) {
      item.descripcion = descripcion;
    }
    if (precioCentavos !== null && precioCentavos !== undefined) {
      item.precio_centavos = precioCentavos;
    }
    if (disponible !== null && disponible !== undefined) {
      item.disponible = disponible;
    }

    return {
      rows: [
        {
          id: item.id,
          nombre: item.nombre,
          descripcion: item.descripcion,
          precioCentavos: item.precio_centavos,
          disponible: item.disponible,
        },
      ],
    };
  }

  return { rows: [] };
}

const connectionString = process.env.DATABASE_URL;
const realPool = connectionString ? new Pool({ connectionString }) : null;

export const pool = {
  query: async (text: string, params?: unknown[]) => {
    if (realPool) {
      try {
        return await realPool.query(text, params);
      } catch {
        console.warn("[AI Studio] Database unreachable — using in-memory store");
      }
    }
    return mockQuery(text, params);
  },
};


