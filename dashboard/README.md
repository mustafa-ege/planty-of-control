# Planty Dashboard

React UI for PlantyOfControl (reads Node.js backend).

## Run

1. Start Mosquitto and backend (`cd backend && npm run dev`).
2. Install and start dashboard:

```bash
cd dashboard
npm install
npm run dev
```

Open http://localhost:5173

Vite proxies `/api`, `/health`, and `/ws` to `http://localhost:8080`.

## Features

- Overview cards (temp, humidity, soil, water, light, actuators)
- History chart (soil / humidity / temperature)
- Controls (pump, fan, mode, stop all)
- Offline detection (no telemetry for 30s)
- Realtime via WebSocket + 5s polling fallback
