# Assista

Assista es una aplicación para pequeños negocios de comida. Su objetivo
es recibir pedidos telefónicos mediante un asistente de inteligencia
artificial y permitir que el personal los gestione desde un panel web.

Actualmente está implementado el módulo de administración del menú,
conectado a PostgreSQL y preparado para trabajar con un negocio ficticio.

## Tecnologías utilizadas

- Frontend desarrollado con React, TypeScript y Vite.
- Backend desarrollado con Node.js, TypeScript y Express.
- Base de datos PostgreSQL.
- Control de versiones con Git y GitHub.

## Requisitos

- Node.js 22.12 o posterior dentro de la versión 22.x (o Node.js 24.x).
- npm, incluido con Node.js.
- Docker Desktop (recomendado) o PostgreSQL 18 instalado localmente.

Para consultar las versiones de Node.js, npm y Docker:

```bash
node -v
npm -v
docker -v
```

## Instalar dependencias

El repositorio utiliza npm workspaces para unificar las dependencias de `backend/` y `frontend/`. Desde la raíz del repositorio:

```bash
npm install
```

## Preparar la base de datos local

### Opción A: Con Docker (recomendada, sin pgAdmin)

El archivo `docker-compose.yml` levanta un contenedor `postgres:18-alpine` en el puerto `5435` (para no chocar con instalaciones locales de PostgreSQL en los puertos `5432`/`5433`) y **ejecuta automáticamente todas las migraciones y seeds** en el primer arranque:

```bash
npm run db:up
```

Comandos útiles para administrar el contenedor:
- `npm run db:up` (`docker compose up -d`): inicia la base de datos.
- `npm run db:down` (`docker compose down`): detiene el contenedor conservando los datos.
- `npm run db:reset` (`docker compose down -v && docker compose up -d`): borra el volumen y vuelve a ejecutar desde cero las migraciones y seeds.

### Opción B: Manual con PostgreSQL local / pgAdmin

Crear una base de datos llamada `assista`:

```sql
CREATE DATABASE assista;
```

Ejecutar el contenido de estos archivos en este orden:

1. `backend/db/migrations/001_crear_negocios_y_productos.sql`
2. `backend/db/migrations/002_crear_usuarios_y_sesiones.sql`
3. `backend/db/migrations/003_crear_pedidos.sql`
4. `backend/db/seeds/001_mesa_clara.sql`
5. `backend/db/seeds/002_usuarios_prueba.sql`

## Configurar la conexión

Copiar `backend/.env.example` como `backend/.env`:

```dotenv
DATABASE_URL=postgresql://postgres:assista2026@localhost:5435/assista
DEMO_NEGOCIO_ID=1
CODIGO_INVITACION=MESA-CLARA-2026
ASISTENTE_API_TOKEN=cambia_este_token_secreto_telnyx_2026
```

Si usas Docker (`npm run db:up`), la `DATABASE_URL` anterior funciona directamente sin cambios. Si usas PostgreSQL local sin Docker, ajusta el usuario, la contraseña y el puerto (`5432`).

El archivo `.env` contiene la configuración local y está excluido
del repositorio mediante `.gitignore`.

## Iniciar la aplicación

Mantener PostgreSQL activo y abrir dos terminales en la raíz del proyecto.

En la primera terminal, iniciar el backend:

```bash
npm run dev:backend
```

(O bien `cd backend && npm run dev`).

En la segunda terminal, iniciar el frontend:

```bash
npm run dev:frontend
```

(O bien `cd frontend && npm run dev`).

Abrir la dirección que indique Vite, normalmente:

```text
http://localhost:5173/
```

La pantalla debe mostrar el menú de Mesa Clara. Si todavía no hay
productos registrados, mostrará el mensaje correspondiente al menú vacío.

## Funcionalidades disponibles

- Consultar el listado y la cantidad de productos del negocio.
- Agregar productos con nombre, descripción y precio.
- Visualizar una vista previa durante el alta.
- Editar nombre, descripción y precio mediante un modal.
- Marcar productos como agotados y volver a habilitarlos.
- Conservar los cambios en PostgreSQL al recargar la página.

Los precios se almacenan como enteros en centavos. Por ejemplo,
$85.50 MXN se guarda como `8550`.

## Alcance y autenticación

Cada producto y cada usuario están asociados a un negocio mediante `negocio_id`.
- **Dueño (`dueno`)**: puede consultar, crear, editar y cambiar la disponibilidad de los productos de su negocio.
- **Empleado (`empleado`)**: acceso de solo lectura al menú de su negocio.
- **Registro público (`/api/auth/register`)**: restringido exclusivamente al rol `empleado` y protegido mediante `CODIGO_INVITACION` para vincularse al negocio configurado en `DEMO_NEGOCIO_ID`.

Cuentas de prueba incluidas en `002_usuarios_prueba.sql`:
- Dueña (Mesa Clara): `lucia.garcia` / `MesaClara2026`
- Empleado (Mesa Clara): `carlos.mendez` / `MesaClara2026`
- Dueño (Comedor Reforma): `marco.silva` / `Reforma2026`

Cada integrante utiliza su propia base local. Los productos y usuarios se guardan directamente en PostgreSQL.

## Comprobar la API

Con el backend activo, abrir:

```text
http://localhost:3000/api/health
```

La respuesta esperada es:

```json
{
  "message": "Backend de Assista conectado"
}
```

Para comprobar la consulta del negocio en PostgreSQL:

```text
http://localhost:3000/api/negocio
```

La respuesta contiene el identificador y el nombre de Mesa Clara.

Para consultar los productos:

```text
http://localhost:3000/api/productos
```

Devuelve un arreglo con los productos del negocio configurado.
Si el menú está vacío, devuelve `[]`.

## Integración con Telnyx Voice AI Agent (Webhook Tools)

El backend expone dos rutas para los **Webhook Tools** del agente telefónico, autenticadas con el encabezado `Authorization: Bearer <ASISTENTE_API_TOKEN>`:

1. **`GET /api/asistente/menu`** (Tool `consultar_menu`):
   - Devuelve el nombre del restaurante y únicamente los productos con `disponible = true`, incluyendo `id`, `nombre`, `descripcion`, `precio` formateado (`125.00 MXN`) y `precioCentavos`.
2. **`POST /api/asistente/pedidos`** (Tool `crear_pedido`):
   - Recibe `clienteNombre`, `clienteTelefono`, `tipoEntrega` (`recoger` | `domicilio`), `direccionEntrega` (obligatoria si es `domicilio`), `notas` e `items` (`[{ productoId, cantidad, notas }]`).
   - Lee `x-telnyx-call-control-id` para garantizar idempotencia si Telnyx reintenta el webhook.
   - Valida disponibilidad y calcula `total_centavos` directamente desde PostgreSQL dentro de una transacción.

Para gestión del personal desde el panel web (autenticado con cookie `HttpOnly` `assista_sid`):
- `GET /api/pedidos?estado=pendiente,en_preparacion&limite=50`
- `POST /api/pedidos` (alta manual de pedidos)
- `PATCH /api/pedidos/:id` (`{ "estado": "en_preparacion" | "listo" | "entregado" | "cancelado" }`)

## Verificar el proyecto

Desde la raíz del repositorio (o dentro de cada paquete), ejecutar:

```bash
npm run build
npm run lint
npm test
```

## Estructura del proyecto

- `backend/src/` contiene el servidor, la conexión y las rutas de la API.
- `backend/db/migrations/` contiene los scripts de estructura de la base.
- `backend/db/seeds/` contiene los datos iniciales de prueba.
- `backend/.env.example` contiene un ejemplo de configuración.
- `frontend/src/` contiene la interfaz, los componentes y los estilos.
- `.gitignore` define los archivos excluidos del repositorio.
