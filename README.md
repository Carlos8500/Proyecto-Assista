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

- Node.js 22.12 o posterior dentro de la versión 22.x.
- npm, incluido con Node.js.
- PostgreSQL 18.
- pgAdmin u otro cliente de PostgreSQL.

El módulo se ha probado con Node.js 22.15.0.

Para consultar las versiones de Node.js y npm:

```bash
node -v
npm -v
```

## Instalar dependencias

El repositorio utiliza npm workspaces para unificar las dependencias de `backend/` y `frontend/`. Desde la raíz del repositorio:

```bash
npm install
```

## Preparar la base de datos local

Crear una base de datos llamada `assista`. Desde una conexión a
PostgreSQL, se puede ejecutar:

```sql
CREATE DATABASE assista;
```

Abrir un Query Tool conectado a la nueva base `assista` y ejecutar
el contenido de estos archivos en este orden:

1. `backend/db/migrations/001_crear_negocios_y_productos.sql`
2. `backend/db/migrations/002_crear_usuarios_y_sesiones.sql`
3. `backend/db/seeds/001_mesa_clara.sql`
4. `backend/db/seeds/002_usuarios_prueba.sql`

Las migraciones crean las tablas de negocios, productos, usuarios y sesiones.
Los seeds registran el negocio ficticio Mesa Clara (y Comedor Reforma) junto
con cuentas de prueba para dueño y empleado.

Consultar el identificador asignado al negocio:

```sql
SELECT id, nombre
FROM negocios
WHERE nombre = 'Mesa Clara';
```

## Configurar la conexión

Copiar `backend/.env.example` como `backend/.env` y completar:

```dotenv
DATABASE_URL=postgresql://postgres:TU_PASSWORD@localhost:5432/assista
DEMO_NEGOCIO_ID=1
CODIGO_INVITACION=MESA-CLARA-2026
```

Ajustar el usuario, la contraseña y el puerto a la instalación local.
Si la contraseña contiene caracteres especiales, deben codificarse
para utilizarlos dentro de la URL.

Asignar a `DEMO_NEGOCIO_ID` el identificador obtenido para Mesa Clara y
a `CODIGO_INVITACION` el código requerido para que nuevos empleados se
registren en ese negocio.

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
