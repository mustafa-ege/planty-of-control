# MQTT Topics + Payload Spec (PlantyOfControl MVP)

This document is the **single source of truth** for:

- MQTT topic hierarchy
- JSON payload schemas (telemetry, state, command)
- Units, ranges, and required fields

## Naming conventions

- **Base namespace**: `planty/v1`
- **Device identifier**: `deviceId` is a short stable string (e.g. `esp32-001`)
- **QoS (MVP)**: QoS 0 for telemetry; QoS 1 for commands/state if supported
- **Retained messages**
  - Telemetry: **not retained**
  - State: **retained** (so UI gets last-known state on reconnect)
  - Command: **not retained** (avoid replaying old commands)

## Topics

### Telemetry (device → backend)

- **Topic**: `planty/v1/{deviceId}/telemetry`
- **Direction**: publish by firmware, subscribe by backend
- **Frequency (MVP)**: every 5–10 seconds

### Device state (device → backend + dashboard)

- **Topic**: `planty/v1/{deviceId}/state`
- **Direction**: publish by firmware, subscribe by backend
- **Retained**: yes
- **Used for**: actuator on/off, last command ack, firmware health

### Commands (backend/dashboard → device)

- **Topic**: `planty/v1/{deviceId}/cmd`
- **Direction**: publish by backend, subscribe by firmware
- **Retained**: no

### Availability / Last Will (optional but recommended)

- **Topic**: `planty/v1/{deviceId}/availability`
- **Payload**: `{"online":true,"ts":1710000000000}` / `{"online":false,"ts":1710000000000}`
- **Retained**: yes

## Payload: Telemetry (JSON)

**Topic**: `planty/v1/{deviceId}/telemetry`

### Required fields

- `deviceId` (string)
- `ts` (number): epoch milliseconds
- `seq` (number): monotonically increasing counter (wrap allowed)
- `tempC` (number)
- `humidityPct` (number, 0–100)
- `soilRaw` (number): raw ADC (board-dependent range)
- `soilPct` (number, 0–100): calibrated

### Optional fields (MVP+)

- `waterLevelPct` (number, 0–100)
- `gps` (object): `{ "lat": number, "lon": number, "hdop": number|null }`
- `rssi` (number): Wi‑Fi RSSI in dBm
- `vbat` (number): battery voltage, if present

### Example

```json
{
  "deviceId": "esp32-001",
  "ts": 1760000000123,
  "seq": 481,
  "tempC": 23.4,
  "humidityPct": 51.2,
  "soilRaw": 2478,
  "soilPct": 41.0,
  "waterLevelPct": 78.0,
  "rssi": -62
}
```

## Payload: State (JSON)

**Topic**: `planty/v1/{deviceId}/state`

### Required fields

- `deviceId` (string)
- `ts` (number): epoch milliseconds
- `pumpOn` (boolean)
- `fanOn` (boolean)
- `mode` (string): `"auto"` or `"manual"`
- `lastCmdId` (string|null): last command id processed

### Example

```json
{
  "deviceId": "esp32-001",
  "ts": 1760000000456,
  "pumpOn": false,
  "fanOn": false,
  "mode": "auto",
  "lastCmdId": "cmd_01J9K9G8Y3S6M1RZ8Y1Z2QH5Y2"
}
```

## Payload: Command (JSON)

**Topic**: `planty/v1/{deviceId}/cmd`

### Required fields

- `cmdId` (string): unique per command (use ULID/UUID)
- `ts` (number): epoch milliseconds (issued time)
- `type` (string): `"setMode" | "pump" | "fan" | "stopAll"`

### Command variants

#### `setMode`

- `type`: `"setMode"`
- `mode`: `"auto" | "manual"`

Example:

```json
{ "cmdId": "cmd_...", "ts": 1760000001000, "type": "setMode", "mode": "manual" }
```

#### `pump`

- `type`: `"pump"`
- `on`: boolean
- `durationMs` (number|null): required when `on=true` for MVP safety (e.g. 500–5000ms)

Example:

```json
{ "cmdId": "cmd_...", "ts": 1760000002000, "type": "pump", "on": true, "durationMs": 1500 }
```

#### `fan`

- `type`: `"fan"`
- `on`: boolean
- `durationMs` (number|null): optional (fan can be toggled or timed)

Example:

```json
{ "cmdId": "cmd_...", "ts": 1760000002500, "type": "fan", "on": true, "durationMs": 5000 }
```

#### `stopAll`

- `type`: `"stopAll"`

Example:

```json
{ "cmdId": "cmd_...", "ts": 1760000003000, "type": "stopAll" }
```

## Validation rules (MVP)

- Backend rejects telemetry if any required field missing or not a number/boolean as defined.
- Backend clamps/flags out-of-range values (e.g., `humidityPct` not in 0–100).
- Firmware ignores commands that:
  - Are missing required fields
  - Have `durationMs` outside safety bounds
  - Repeat an already-processed `cmdId` (idempotency)

## Safety defaults (MVP)

- Pump command must be **time-bound**; firmware enforces:
  - `durationMsMin = 250`
  - `durationMsMax = 5000`
  - `cooldownMs = 60_000` between automatic pump activations
- Firmware should fail safe: on parsing error, do nothing and keep actuators off.

