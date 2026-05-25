#pragma once

// Device identity
// Keep this stable; it becomes part of MQTT topics and payloads.
#ifndef PLANTY_DEVICE_ID
#define PLANTY_DEVICE_ID "esp32-001"
#endif

// MQTT base namespace (must match docs/mqtt-and-payload-spec.md)
#ifndef PLANTY_MQTT_BASE
#define PLANTY_MQTT_BASE "planty/v1"
#endif

// Sensors
// DHT
#define PLANTY_DHT_PIN 4
#define PLANTY_DHT_TYPE DHT22

// Soil moisture (capacitive) ADC input pin (ESP32 ADC1 pins recommended)
#define PLANTY_SOIL_ADC_PIN 34

// Soil calibration (raw ADC -> percentage)
// Measure your sensor raw value in DRY air and in WET soil, then set these.
// For many capacitive sensors: wetRaw < dryRaw (inverted).
#define PLANTY_SOIL_DRY_RAW 4095
#define PLANTY_SOIL_WET_RAW 1500

// light sensor TEMT6000
#define PLANTY_LIGHT_PIN 32

// Actuators (relay module inputs). Do not share pins with sensors.
#define PLANTY_PUMP_PIN 33
#define PLANTY_FAN_PIN 26

// Many relay boards are active-LOW (LOW = relay ON). Set to 0 if yours is active-HIGH.
#ifndef PLANTY_RELAY_ACTIVE_LOW
// Eger kapatma komutlari motorlari calistiriyorsa role Active-LOW'dur:
#define PLANTY_RELAY_ACTIVE_LOW 1
#endif

// Command safety (see docs/mqtt-and-payload-spec.md)
#define PLANTY_PUMP_DURATION_MIN_MS 250
#define PLANTY_PUMP_DURATION_MAX_MS 30000
#define PLANTY_FAN_DURATION_MAX_MS 30000
#define PLANTY_PUMP_COOLDOWN_MS 60000

//distance sensor for the water level measurement
#define PLANTY_DISTANCE_TRIG_PIN 5
#define PLANTY_DISTANCE_ECHO_PIN 18
#define PLANTY_TANK_MAX_DEPTH_CM 20

// GPS Module (NEO-M8N)
#define PLANTY_GPS_RX_PIN 16
#define PLANTY_GPS_TX_PIN 17
#define PLANTY_GPS_BAUD 9600

// Otomatik Mod Eşik Değerleri
#define PLANTY_FAN_HUMIDITY_THRESHOLD 80.0
#define PLANTY_PUMP_SOIL_THRESHOLD 15.0

// Telemetry cadence
#define PLANTY_TELEMETRY_INTERVAL_MS 5000

// MQTT client settings
#define PLANTY_MQTT_KEEPALIVE_SEC 30
