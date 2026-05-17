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

//fan and pump control pins
#define PLANTY_FAN_PIN 32

#define PLANTY_PUMP_PIN 33

//distance sensor for the water level measurement
#define PLANTY_DISTANCE_TRIG_PIN 5
#define PLANTY_DISTANCE_ECHO_PIN 18
#define PLANTY_TANK_MAX_DEPTH_CM 20

// Telemetry cadence
#define PLANTY_TELEMETRY_INTERVAL_MS 5000

// MQTT client settings
#define PLANTY_MQTT_KEEPALIVE_SEC 30

