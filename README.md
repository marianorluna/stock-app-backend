# Stockearly Backend

Backend service for the Stockearly MVP. It implements an event-driven architecture for ingesting sales, purchases, and wastage events, mutating inventory in real time, and broadcasting changes to connected clients via WebSockets.

## Stack

- Node.js + Express
- MongoDB with Mongoose ODM
- Socket.io for push notifications
- JWT authentication
- Joi validation

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   Copy `env.example` to `.env` and adjust values as needed.

3. **Run locally**

   ```bash
   npm run dev
   ```

   The API listens on `http://localhost:4000` by default, exposing REST endpoints under `/api` and a WebSocket server.

   > Development shortcut: set `AUTH_DISABLED=true` in `.env` to bypass JWT authentication. Do **not** enable this in production.
   >
   > If you expose the frontend on your LAN (e.g. `http://192.168.1.10:5173`), include that URL in `CLIENT_ORIGIN` along with `http://localhost:5173` so CORS and Socket.io allow the connection.

## Key Endpoints

### Autenticación
- `POST /api/auth/register` - Registrar nuevo usuario
- `POST /api/auth/login` - Iniciar sesión

### Ingredientes
- `GET /api/ingredients` - Listar ingredientes
- `POST /api/ingredients` - Crear ingrediente
- `PUT /api/ingredients/:id` - Actualizar ingrediente
- `DELETE /api/ingredients/:id` - Eliminar ingrediente

### Recetas (Dishes)
- `GET /api/dishes` - Listar recetas
- `POST /api/dishes` - Crear receta
- `PUT /api/dishes/:id` - Actualizar receta
- `DELETE /api/dishes/:id` - Eliminar receta

### Registro Manual
- `GET /api/manual/sales` - Listar ventas manuales
- `POST /api/manual/sales` - Registrar venta manual
- `GET /api/manual/purchases` - Listar compras manuales
- `POST /api/manual/purchases` - Registrar compra manual
- `GET /api/manual/wastage` - Listar mermas
- `POST /api/manual/wastage` - Registrar merma
- `DELETE /api/manual/wastage/:id` - Eliminar merma
- `GET /api/manual/wastage/presets` - Listar presets de merma
- `POST /api/manual/wastage/presets` - Crear preset de merma
- `DELETE /api/manual/wastage/presets/:id` - Eliminar preset de merma

### Dashboard
- `GET /api/dashboard/snapshot` - Obtener snapshot del inventario

### Webhooks
- `POST /api/webhook/pos` - Webhook para recibir ventas del POS

### Proveedores
- `GET /api/suppliers` - Listar proveedores
- `POST /api/suppliers` - Crear proveedor
- `PUT /api/suppliers/:id` - Actualizar proveedor
- `DELETE /api/suppliers/:id` - Eliminar proveedor

### Notificaciones
- `GET /api/notifications` - Listar notificaciones del usuario
- `PUT /api/notifications/:id/read` - Marcar notificación como leída
- `PUT /api/notifications/read-all` - Marcar todas las notificaciones como leídas

### Facturas (Invoices)
- `POST /api/invoices/upload` - Subir factura JSON (requiere `inventory:create`)
- `POST /api/invoices/preview/:invoiceId` - Generar preview de factura sin aplicar cambios (requiere `inventory:create`)
- `POST /api/invoices/confirm/:invoiceId` - Confirmar y aplicar cambios de factura (requiere `inventory:create`)
- `GET /api/invoices/sync/:fileName` - Sincronizar factura por nombre de archivo (requiere `inventory:create`)
- `POST /api/invoices/sync` - Sincronizar factura desde ruta completa (requiere `inventory:create`)

## Event Flow

- Webhook/manual endpoints persist the event (`Sale`, `Purchase`, `Wastage`) and trigger stock adjustments through `stockService`.
- The custom `EventBus` emits domain events (`SALE_RECORDED`, etc.).
- Socket.io listeners broadcast events to subscribed clients in real time.

## Variables de Entorno

### Obligatorias
- `PORT` - Puerto del servidor (default: 4000)
- `NODE_ENV` - Entorno de ejecución (`development` o `production`)
- `MONGODB_URI` - URI de conexión a MongoDB (local)
- `MONGODB_URI_ATLAS` - URI de conexión a MongoDB Atlas (usado en producción si está definido)
- `CLIENT_ORIGIN` - Orígenes permitidos para CORS, separados por coma (ej: `http://localhost:5173,https://app.example.com`)
- `FIREBASE_PROJECT_ID` - ID del proyecto Firebase
- `FIREBASE_CLIENT_EMAIL` - Email de la cuenta de servicio de Firebase
- `FIREBASE_PRIVATE_KEY` - Clave privada de Firebase (con `\n` para saltos de línea)

### Opcionales (para procesamiento de facturas PDF)
- `GEMINI_API_KEY` - API Key de Google Gemini para procesamiento de PDFs
- `GCS_BUCKET_NAME` - Nombre del bucket de Google Cloud Storage (default: `etama-facturas-pdf-gmail`)
- `GCS_PROJECT_ID` o `GCP_PROJECT_ID` - ID del proyecto de Google Cloud
- Variables de credenciales de Google Cloud Storage (prefijo `GCS_` o `GCP_`):
  - `GCS_PROJECT_ID` / `GCP_PROJECT_ID`
  - `GCS_PRIVATE_KEY_ID` / `GCP_PRIVATE_KEY_ID`
  - `GCS_PRIVATE_KEY` / `GCP_PRIVATE_KEY`
  - `GCS_CLIENT_EMAIL` / `GCP_CLIENT_EMAIL`
  - `GCS_CLIENT_ID` / `GCP_CLIENT_ID`
  - `GCS_AUTH_URI` / `GCP_AUTH_URI`
  - `GCS_TOKEN_URI` / `GCP_TOKEN_URI`
  - `GCS_AUTH_PROVIDER_X509_CERT_URL` / `GCP_AUTH_PROVIDER_X509_CERT_URL`
  - `GCS_CLIENT_X509_CERT_URL` / `GCP_CLIENT_X509_CERT_URL`

### Desarrollo
- `AUTH_DISABLED` - Deshabilitar autenticación (solo para desarrollo, **NO usar en producción**)

## Funcionalidades de Facturas

El sistema soporta procesamiento de facturas en formato JSON y PDF:

1. **Facturas JSON**: Se pueden subir directamente desde el frontend
2. **Preview**: Antes de aplicar cambios, se puede generar un preview que muestra:
   - Resumen de items
   - Nuevos ingredientes que se crearán
   - Ingredientes que se actualizarán
   - Errores encontrados
3. **Confirmación**: Una vez revisado el preview, se puede confirmar para aplicar los cambios al inventario
4. **Facturas PDF**: Procesamiento automático desde Google Cloud Storage usando Gemini AI (requiere configuración de GCS y Gemini)

## Next Steps

- Add automated webhook signature verification.
- Harden validation and add rate-limiting/auth around webhooks.
