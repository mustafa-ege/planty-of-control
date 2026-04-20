#include <Arduino.h>
#include <WiFi.h>

#include <PubSubClient.h>
#include <ArduinoJson.h>

#include <DHT.h>

#include "planty_config.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif

namespace {
WiFiClient espClient;
PubSubClient mqtt(espClient);

DHT dht(PLANTY_DHT_PIN, PLANTY_DHT_TYPE);

uint32_t seqCounter = 0;

unsigned long lastTelemetryMs = 0;
unsigned long lastWifiAttemptMs = 0;
unsigned long lastMqttAttemptMs = 0;

// State (actuation will be implemented in the next todo; keep default off)
bool pumpOn = false;
bool fanOn = false;
const char *mode = "auto";
char lastCmdId[48] = {0};

String topicTelemetry() {
  return String(PLANTY_MQTT_BASE) + "/" + PLANTY_DEVICE_ID + "/telemetry";
}
String topicState() {
  return String(PLANTY_MQTT_BASE) + "/" + PLANTY_DEVICE_ID + "/state";
}
String topicCmd() {
  return String(PLANTY_MQTT_BASE) + "/" + PLANTY_DEVICE_ID + "/cmd";
}
String topicAvailability() {
  return String(PLANTY_MQTT_BASE) + "/" + PLANTY_DEVICE_ID + "/availability";
}

uint32_t nowMs() { return millis(); }
uint64_t epochMsApprox() {
  // MVP: we don't have RTC/NTP yet. Use millis as a monotonic-ish timestamp source.
  // Backend can replace/augment with its own receive time.
  return static_cast<uint64_t>(millis());
}

float clampf(float v, float lo, float hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

float soilRawToPct(int raw) {
  const float dry = static_cast<float>(PLANTY_SOIL_DRY_RAW);
  const float wet = static_cast<float>(PLANTY_SOIL_WET_RAW);
  if (dry == wet) return 0.0f;

  // Map raw to [0..100] where 0=dry, 100=wet
  const float pct = (dry - raw) * 100.0f / (dry - wet);
  return clampf(pct, 0.0f, 100.0f);
}

void publishAvailability(bool online) {
  StaticJsonDocument<96> doc;
  doc["online"] = online;
  doc["ts"] = epochMsApprox();

  char buf[96];
  const size_t n = serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topicAvailability().c_str(), buf, n, true /*retain*/);
}

void publishState() {
  StaticJsonDocument<192> doc;
  doc["deviceId"] = PLANTY_DEVICE_ID;
  doc["ts"] = epochMsApprox();
  doc["pumpOn"] = pumpOn;
  doc["fanOn"] = fanOn;
  doc["mode"] = mode;
  if (lastCmdId[0] == '\0') {
    doc["lastCmdId"] = nullptr;
  } else {
    doc["lastCmdId"] = lastCmdId;
  }

  char buf[256];
  const size_t n = serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topicState().c_str(), buf, n, true /*retain*/);
}

void handleCmd(const JsonDocument &doc) {
  const char *cmdId = doc["cmdId"] | nullptr;
  const char *type = doc["type"] | nullptr;

  if (!cmdId || !type) return;
  if (strlen(cmdId) >= sizeof(lastCmdId)) return;

  // Idempotency: ignore duplicates
  if (strncmp(lastCmdId, cmdId, sizeof(lastCmdId)) == 0) return;

  // Record ack (even if we don't actuate yet)
  strncpy(lastCmdId, cmdId, sizeof(lastCmdId));
  lastCmdId[sizeof(lastCmdId) - 1] = '\0';

  if (strcmp(type, "setMode") == 0) {
    const char *newMode = doc["mode"] | nullptr;
    if (newMode && (strcmp(newMode, "auto") == 0 || strcmp(newMode, "manual") == 0)) {
      mode = (strcmp(newMode, "auto") == 0) ? "auto" : "manual";
    }
  } else if (strcmp(type, "stopAll") == 0) {
    // Actuation comes later; keep local state consistent for now.
    pumpOn = false;
    fanOn = false;
  } else if (strcmp(type, "pump") == 0) {
    // Parsed for now; actuation to be implemented in next todo.
    pumpOn = (doc["on"] | false);
  } else if (strcmp(type, "fan") == 0) {
    fanOn = (doc["on"] | false);
  }

  publishState();
}

void mqttCallback(char *topic, byte *payload, unsigned int length) {
  (void)topic;

  StaticJsonDocument<384> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) return;
  handleCmd(doc);
}

void ensureWifiConnected() {
  if (WiFi.status() == WL_CONNECTED) return;

  const unsigned long now = nowMs();
  if (now - lastWifiAttemptMs < 3000) return;
  lastWifiAttemptMs = now;

  WiFi.mode(WIFI_STA);
  WiFi.begin(PLANTY_WIFI_SSID, PLANTY_WIFI_PASS);
}

bool ensureMqttConnected() {
  if (mqtt.connected()) return true;
  if (WiFi.status() != WL_CONNECTED) return false;

  const unsigned long now = nowMs();
  if (now - lastMqttAttemptMs < 2000) return false;
  lastMqttAttemptMs = now;

  mqtt.setServer(PLANTY_MQTT_HOST, PLANTY_MQTT_PORT);
  mqtt.setKeepAlive(PLANTY_MQTT_KEEPALIVE_SEC);
  mqtt.setCallback(mqttCallback);

  const String clientId = String("planty-") + PLANTY_DEVICE_ID + "-" + String((uint32_t)ESP.getEfuseMac(), HEX);

  // LWT for availability
  StaticJsonDocument<96> lwt;
  lwt["online"] = false;
  lwt["ts"] = epochMsApprox();
  char lwtBuf[96];
  const size_t lwtN = serializeJson(lwt, lwtBuf, sizeof(lwtBuf));

  bool ok = false;
  if (strlen(PLANTY_MQTT_USER) > 0) {
    ok = mqtt.connect(
        clientId.c_str(),
        PLANTY_MQTT_USER,
        PLANTY_MQTT_PASS,
        topicAvailability().c_str(),
        1 /*qos*/,
        true /*retain*/,
        lwtBuf,
        true /*cleanSession*/);
  } else {
    ok = mqtt.connect(
        clientId.c_str(),
        topicAvailability().c_str(),
        1 /*qos*/,
        true /*retain*/,
        lwtBuf);
  }

  if (!ok) return false;

  mqtt.subscribe(topicCmd().c_str(), 1);
  publishAvailability(true);
  publishState();
  return true;
}

void publishTelemetry() {
  const float tempC = dht.readTemperature();
  const float humidityPct = dht.readHumidity();

  const int soilRaw = analogRead(PLANTY_SOIL_ADC_PIN);
  const float soilPct = soilRawToPct(soilRaw);

  StaticJsonDocument<256> doc;
  doc["deviceId"] = PLANTY_DEVICE_ID;
  doc["ts"] = epochMsApprox();
  doc["seq"] = seqCounter++;

  if (!isnan(tempC)) doc["tempC"] = tempC;
  if (!isnan(humidityPct)) doc["humidityPct"] = humidityPct;
  doc["soilRaw"] = soilRaw;
  doc["soilPct"] = soilPct;

  doc["rssi"] = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;

  char buf[320];
  const size_t n = serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topicTelemetry().c_str(), buf, n, false /*retain*/);
}
} // namespace

void setup() {
  Serial.begin(115200);
  delay(100);

  dht.begin();
  analogReadResolution(12);

  WiFi.mode(WIFI_STA);
  ensureWifiConnected();
}

void loop() {
  ensureWifiConnected();
  ensureMqttConnected();
  mqtt.loop();

  const unsigned long now = nowMs();
  if (ensureMqttConnected() && (now - lastTelemetryMs >= PLANTY_TELEMETRY_INTERVAL_MS)) {
    lastTelemetryMs = now;
    publishTelemetry();
  }
}