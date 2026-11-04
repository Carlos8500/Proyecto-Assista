# Assista

Assista es un proyecto de software que utiliza una arquitectura cliente-servidor, con un frontend desarrollado en React y un backend desarrollado en Node.js y Express.

## Tecnologías utilizadas

- **Frontend:** React, TypeScript y Vite.
- **Backend:** Node.js y Express.
- **Control de versiones:** Git y GitHub.

## Requisitos

Para ejecutar el proyecto es necesario tener instalado:

- Node.js **22.12 o posterior, dentro de la versión 22.x**.
- npm, incluido con Node.js.

Para verificar las versiones instaladas, ejecutar:

```bash
node -v
npm -v
```

## Instalación y ejecución

El proyecto está dividido en dos carpetas: `backend` y `frontend`.

Es necesario utilizar **dos terminales**, una para cada parte del proyecto.

### 1. Iniciar el backend

Desde la raíz del proyecto, ejecutar:

```bash
cd backend
npm ci
npm run dev
```

### 2. Iniciar el frontend

Abrir una segunda terminal y ejecutar:

```bash
cd frontend
npm ci
npm run dev
```

Vite mostrará una dirección local en la terminal, normalmente:

```text
http://localhost:5173/
```

## Verificación del funcionamiento

Para comprobar que el frontend y el backend están correctamente conectados:

1. Verificar que ambas terminales continúen ejecutándose.
2. Abrir en el navegador la dirección proporcionada por Vite.
3. Comprobar que se muestra el mensaje:

**Backend de Assista conectado**

Si aparece este mensaje, la comunicación entre React y Express funciona correctamente.

También es posible comprobar directamente el backend mediante:

```text
http://localhost:3000/api/health
```

Este endpoint debe devolver una respuesta JSON con el mensaje:

```json
{
  "message": "Backend de Assista conectado"
}
```

## Estructura del proyecto

```text
Proyecto-Assista/
├── backend/       # Servidor y API con Express
├── frontend/      # Interfaz de usuario con React
├── .gitignore     # Archivos excluidos del repositorio
└── README.md      # Documentación del proyecto
```
