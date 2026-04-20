## Planty Backend (MVP)

### What it does
- Subscribes to MQTT telemetry/state under `MQTT_BASE_TOPIC` (default `planty/v1`)
- Validates payloads (Zod)
- Persists to SQLite
- Exposes REST API for the React dashboard
- Pushes realtime events over WebSocket at `/ws`

### Manual setup (you must do)
1. Install dependencies:

```bash
cd backend
npm install
```

2. Create `.env`:

```bash
cp .env.example .env
```

3. Run Mosquitto locally (or point `MQTT_URL` to your broker).
4. Start the backend:

```bash
npm run dev
```

### Endpoints
- `GET /health`
- `GET /api/devices`
- `GET /api/devices/:id/latest`
- `GET /api/devices/:id/telemetry?limit=300`
- `POST /api/devices/:id/commands` (body must match the command schema in `src/schemas.ts`)

