# Wokwi + Backend + MQTT checklist

## 1) Pump command duration

Firmware allows **250–5000 ms** only.

```json
{ "durationMs": 1500 }
```

`15000` is **rejected** (no LED, no pump).

## 2) Same broker for backend and Wokwi

| Component | MQTT URL / host |
|-----------|-----------------|
| Backend `.env` | `mqtt://127.0.0.1:1883` (on your Mac) |
| Wokwi `secrets.h` | `PLANTY_MQTT_HOST` = Mac **LAN IP** (e.g. `192.168.1.42`) |

Find Mac IP:

```bash
ipconfig getifaddr en0
```

## 3) Verify backend publishes

Terminal:

```bash
mosquitto_sub -h 127.0.0.1 -t 'planty/v1/esp32-001/cmd' -v
```

Postman `POST .../commands` → you should see JSON on this terminal.

If yes but Wokwi does nothing → Wokwi MQTT host/Wi‑Fi is wrong.

## 4) Wokwi Serial Monitor (115200)

Look for:

- `[mqtt] connected`
- `[cmd] ok type=pump` and `[actuator] pump ON 1500ms`

Or errors:

- `[actuator] pump REJECT durationMs=15000`
- `[cmd] actuation ignored during MQTT warm-up` (wait 5s after connect)

## 5) Example Postman body

```json
{
  "cmdId": "cmd_wokwi_4",
  "ts": 1730000000000,
  "type": "pump",
  "on": true,
  "durationMs": 1500
}
```
