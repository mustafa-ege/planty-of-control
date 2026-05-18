#pragma once

// Copy this file to `include/secrets.h` (which is gitignored) and fill values.

// Wi-Fi
#define PLANTY_WIFI_SSID "YOUR_WIFI_SSID"
#define PLANTY_WIFI_PASS "YOUR_WIFI_PASSWORD"

// MQTT broker
// - Physical ESP32: use your PC's LAN IP (ipconfig getifaddr en0 on Mac).
// - Wokwi simulator: NEVER use 127.0.0.1 — that is the sim itself, not your Mac.
//   Use the same LAN IP where Mosquitto runs (e.g. 192.168.1.10).
// - Mosquitto must listen on all interfaces, e.g. listener 1883 0.0.0.0
#define PLANTY_MQTT_HOST "192.168.1.10"
#define PLANTY_MQTT_PORT 1883

// MQTT auth (optional; leave empty strings if not used)
#define PLANTY_MQTT_USER ""
#define PLANTY_MQTT_PASS ""

