#pragma once

// Copy this file to `include/secrets.h` (which is gitignored) and fill values.

// Wi-Fi
#define PLANTY_WIFI_SSID "NetMASTER Uydunet-2F90"
#define PLANTY_WIFI_PASS "d0b4761b78546b5b"

// MQTT broker
// - If running locally on your LAN, use that machine's LAN IP (not 127.0.0.1).
#define PLANTY_MQTT_HOST "192.168.0.28"
#define PLANTY_MQTT_PORT 1883

// MQTT auth (optional; leave empty strings if not used)
#define PLANTY_MQTT_USER ""
#define PLANTY_MQTT_PASS ""

