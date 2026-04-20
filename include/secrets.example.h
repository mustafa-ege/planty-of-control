#pragma once

// Copy this file to `include/secrets.h` (which is gitignored) and fill values.

// Wi-Fi
#define PLANTY_WIFI_SSID "YOUR_WIFI_SSID"
#define PLANTY_WIFI_PASS "YOUR_WIFI_PASSWORD"

// MQTT broker
// - If running locally on your LAN, use that machine's LAN IP (not 127.0.0.1).
#define PLANTY_MQTT_HOST "192.168.1.10"
#define PLANTY_MQTT_PORT 1883

// MQTT auth (optional; leave empty strings if not used)
#define PLANTY_MQTT_USER ""
#define PLANTY_MQTT_PASS ""

