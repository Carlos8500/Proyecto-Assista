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

Desde la raíz del repositorio:

```bash
cd backend
npm ci
cd ../frontend
npm ci
cd ..
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
2. `backend/db/seeds/001_mesa_clara.sql`

La migración crea las tablas y se ejecuta una vez sobre la base vacía.
El seed registra el negocio ficticio Mesa Clara. Los productos se
agregan desde la interfaz.

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
```

Ajustar el usuario, la contraseña y el puerto a la instalación local.
Si la contraseña contiene caracteres especiales, deben codificarse
para utilizarlos dentro de la URL.

Asignar a `DEMO_NEGOCIO_ID` el identificador obtenido para Mesa Clara.

El archivo `.env` contiene la configuración local y está excluido
del repositorio mediante `.gitignore`.

## Iniciar la aplicación

Mantener PostgreSQL activo y abrir dos terminales en la raíz del proyecto.

En la primera terminal, iniciar el backend:

```bash
cd backend
npm run dev
```

En la segunda terminal, iniciar el frontend:

```bash
cd frontend
npm run dev
```

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

## Alcance de la demostración

El negocio se selecciona mediante `DEMO_NEGOCIO_ID` en el backend.
Cada producto está asociado a un negocio mediante `negocio_id`.

La autenticación y los permisos por usuario se integrarán posteriormente.
Los accesos a Pedidos y Cerrar sesión aparecen deshabilitados.

Cada integrante utiliza su propia base local. Los productos capturados
desde la interfaz se guardan en la base a la que apunta su backend.

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

## Verificar el frontend

Desde `frontend/`, ejecutar:

```bash
npm run build
npm run lint
```

## Estructura del proyecto

- `backend/src/` contiene el servidor, la conexión y las rutas de la API.
- `backend/db/migrations/` contiene los scripts de estructura de la base.
- `backend/db/seeds/` contiene los datos iniciales de prueba.
- `backend/.env.example` contiene un ejemplo de configuración.
- `frontend/src/` contiene la interfaz, los componentes y los estilos.
- `.gitignore` define los archivos excluidos del repositorio.
