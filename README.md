# StockControl Backend

Backend service for the StockControl MVP. It implements an event-driven architecture for ingesting sales, purchases, and wastage events, mutating inventory in real time, and broadcasting changes to connected clients via WebSockets.

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

- `POST /api/auth/register` & `POST /api/auth/login`
- `GET/POST/PUT/DELETE /api/ingredients`
- `GET/POST/PUT/DELETE /api/dishes`
- `POST /api/manual/sales`
- `POST /api/manual/purchases`
- `POST /api/manual/wastage`
- `POST /api/webhook/pos`
- `GET /api/dashboard/snapshot`

## Event Flow

- Webhook/manual endpoints persist the event (`Sale`, `Purchase`, `Wastage`) and trigger stock adjustments through `stockService`.
- The custom `EventBus` emits domain events (`SALE_RECORDED`, etc.).
- Socket.io listeners broadcast events to subscribed clients in real time.

## Next Steps

- Add automated webhook signature verification.
- Implement OCR ingestion service for purchase PDFs.
- Harden validation and add rate-limiting/auth around webhooks.
