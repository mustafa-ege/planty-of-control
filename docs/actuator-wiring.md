# Actuator wiring (MVP)

## GPIO map (default in `include/planty_config.h`)

| Function | GPIO | Notes |
|----------|------|--------|
| DHT22 data | 4 | |
| Soil moisture ADC | 34 | |
| Light sensor ADC | 32 | |
| Ultrasonic TRIG | 5 | HC-SR04 |
| Ultrasonic ECHO | 18 | |
| Pump relay IN | 33 | |
| Fan relay IN | 26 | Changed from 32 to avoid conflict with light sensor |

## Relay module

- Use a **2-channel 3.3V relay board** (optocoupler) for pump and fan.
- Default firmware assumes **active-LOW** relays (`PLANTY_RELAY_ACTIVE_LOW 1`).
  - If your relay turns on with HIGH, set `PLANTY_RELAY_ACTIVE_LOW` to `0` in `planty_config.h`.
- **Never** drive a mains pump directly from the ESP32. Use the relay to switch the pump’s power supply.

## Safety (firmware)

- Pump ON requires `durationMs` between **250** and **5000** ms.
- **60 s cooldown** between pump starts.
- `stopAll` turns pump and fan off immediately.
- On MQTT disconnect, actuators are turned off and state is published when possible.

## Test without hardware (Wokwi)

Firmware uses **active-LOW** relays (OFF = GPIO HIGH, ON = GPIO LOW).

Wire simulation LEDs so they match the relay (not “LED to 3V3 + GND” on the pin):

- **3V3 → resistor → LED anode → LED cathode → GPIO** (33 pump, 26 fan)
- Pump/fan **OFF** → pin HIGH → LED **off**
- Pump/fan **ON** → pin LOW → LED **on**

See `diagram.json` for the Wokwi connections.

Postman: `POST /api/devices/esp32-001/commands` with pump body from `docs/mqtt-and-payload-spec.md`.
