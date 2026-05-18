
#include <Arduino.h>
#include <WiFi.h>

#include <PubSubClient.h>
#include <ArduinoJson.h>

#include <DHT.h>
#include <Preferences.h>

#include "planty_config.h"
#include "actuator.h"

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

const char *mode = "auto";
char lastCmdId[48] = {0};
bool mqttWasConnected = false;
unsigned long cmdActuationAllowedAfterMs = 0;

Preferences plantyPrefs;

void loadPersistedCmdId() {
  if (!plantyPrefs.begin("planty", true)) return;
  const String s = plantyPrefs.getString("lastCmdId", "");
  plantyPrefs.end();
  if (s.length() > 0 && s.length() < sizeof(lastCmdId)) {
    strncpy(lastCmdId, s.c_str(), sizeof(lastCmdId));
    lastCmdId[sizeof(lastCmdId) - 1] = '\0';
    Serial.printf("[cmd] restored lastCmdId=%s\n", lastCmdId);
  }
}

void persistCmdId() {
  if (!plantyPrefs.begin("planty", false)) return;
  plantyPrefs.putString("lastCmdId", lastCmdId);
  plantyPrefs.end();
}

bool isActuationType(const char *type) {
  return strcmp(type, "pump") == 0 || strcmp(type, "fan") == 0 || strcmp(type, "stopAll") == 0;
}

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
  mqtt.publish(topicAvailability().c_str(), (const uint8_t*)buf, n, true /*retain*/);
}

void publishState() {
  StaticJsonDocument<192> doc;
  doc["deviceId"] = PLANTY_DEVICE_ID;
  doc["ts"] = epochMsApprox();
  doc["pumpOn"] = actuatorIsPumpOn();
  doc["fanOn"] = actuatorIsFanOn();
  doc["mode"] = mode;
  if (lastCmdId[0] == '\0') {
    doc["lastCmdId"] = nullptr;
  } else {
    doc["lastCmdId"] = lastCmdId;
  }

  char buf[256];
  const size_t n = serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topicState().c_str(), (const uint8_t*)buf, n, true /*retain*/);
}

bool handleCmd(const JsonDocument &doc) {
  const char *cmdId = doc["cmdId"] | nullptr;
  const char *type = doc["type"] | nullptr;

  if (!cmdId || !type) return false;
  if (strlen(cmdId) >= sizeof(lastCmdId)) return false;

  // Idempotency: ignore duplicates (RAM + flash across reboots / retained MQTT)
  if (strncmp(lastCmdId, cmdId, sizeof(lastCmdId)) == 0) {
    Serial.printf("[cmd] duplicate ignored cmdId=%s\n", cmdId);
    return false;
  }

  if (isActuationType(type) && nowMs() < cmdActuationAllowedAfterMs) {
    Serial.println("[cmd] actuation ignored during MQTT warm-up");
    return false;
  }

  bool ok = true;

  if (strcmp(type, "setMode") == 0) {
    const char *newMode = doc["mode"] | nullptr;
    if (newMode && (strcmp(newMode, "auto") == 0 || strcmp(newMode, "manual") == 0)) {
      mode = (strcmp(newMode, "auto") == 0) ? "auto" : "manual";
    } else {
      ok = false;
    }
  } else if (strcmp(type, "stopAll") == 0) {
    actuatorStopAll();
  } else if (strcmp(type, "pump") == 0) {
    const bool on = doc["on"] | false;
    if (on) {
      if (doc["durationMs"].isNull()) {
        ok = false;
      } else {
        const unsigned long durationMs = doc["durationMs"].as<unsigned long>();
        ok = actuatorPump(true, durationMs);
      }
    } else {
      ok = actuatorPump(false, 0);
    }
  } else if (strcmp(type, "fan") == 0) {
    const bool on = doc["on"] | false;
    unsigned long durationMs = 0;
    if (!doc["durationMs"].isNull()) {
      durationMs = doc["durationMs"].as<unsigned long>();
    }
    ok = actuatorFan(on, durationMs);
  } else {
    ok = false;
  }

  if (!ok) {
    Serial.printf("[cmd] FAILED type=%s cmdId=%s\n", type, cmdId);
    return false;
  }

  strncpy(lastCmdId, cmdId, sizeof(lastCmdId));
  lastCmdId[sizeof(lastCmdId) - 1] = '\0';
  persistCmdId();
  publishState();
  Serial.printf("[cmd] ok type=%s cmdId=%s\n", type, cmdId);
  return true;
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

  actuatorStopAll();
  cmdActuationAllowedAfterMs = nowMs() + 5000;

  mqtt.subscribe(topicCmd().c_str(), 1);
  publishAvailability(true);
  publishState();
  Serial.println("[mqtt] connected; actuation blocked 5s (ignore stale retained cmd)");
  return true;
}

void publishTelemetry() {
  // --- 1. DHT22 Okuma ---
  const float tempC = dht.readTemperature();
  const float humidityPct = dht.readHumidity();

  // --- 2. Toprak Nemi Okuma ---
  const int soilRaw = analogRead(PLANTY_SOIL_ADC_PIN);
  const float soilPct = soilRawToPct(soilRaw);

  // --- 3. Işık Sensörü Okuma ---
  const int lightRaw = analogRead(PLANTY_LIGHT_PIN);
  const float lightPct = (lightRaw / 4095.0f) * 100.0f; // 12-bit ADC yüzdesi

  // --- 4. HC-SR04 Su Seviyesi Okuma ---
  digitalWrite(PLANTY_DISTANCE_TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(PLANTY_DISTANCE_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(PLANTY_DISTANCE_TRIG_PIN, LOW);

  const long duration = pulseIn(PLANTY_DISTANCE_ECHO_PIN, HIGH, 30000); // 30ms timeout
  float waterLevelPct = 0.0f;
  
if (duration > 0) {
    float distanceCm = duration * 0.034f / 2.0f;
    waterLevelPct = ((PLANTY_TANK_MAX_DEPTH_CM - distanceCm) / PLANTY_TANK_MAX_DEPTH_CM) * 100.0f;
    waterLevelPct = clampf(waterLevelPct, 0.0f, 100.0f);
  } else {
    // Sensör okunamazsa null veya 0 basarak sistemi kitlemesini önlüyoruz
    waterLevelPct = 0.0f; 
  }

  // --- 5. JSON Paketleme ve Gönderme ---
  // Sensör sayısı arttığı için buffer boyutunu 256'dan 384'e çıkardık
  StaticJsonDocument<384> doc; 
  doc["deviceId"] = PLANTY_DEVICE_ID;
  doc["ts"] = epochMsApprox();
  doc["seq"] = seqCounter++;

  if (!isnan(tempC)) doc["tempC"] = tempC;
  if (!isnan(humidityPct)) doc["humidityPct"] = humidityPct;
  doc["soilRaw"] = soilRaw;
  doc["soilPct"] = soilPct;
  doc["waterLevelPct"] = waterLevelPct;
  doc["lightPct"] = lightPct; // Backend veritabanında varsa direkt kaydolur

  doc["rssi"] = WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0;

  char buf[384];
  const size_t n = serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topicTelemetry().c_str(), (const uint8_t*)buf, n, false /*retain*/);
}
} // namespace

// Uygulamadaki V0 pinine basıldığında bu fonksiyon tetiklenir
void setup() {
  Serial.begin(115200);
  delay(100);

  dht.begin();
  analogReadResolution(12);

  pinMode(PLANTY_DISTANCE_TRIG_PIN, OUTPUT);
  pinMode(PLANTY_DISTANCE_ECHO_PIN, INPUT);

  actuatorInit();
  loadPersistedCmdId();

  WiFi.mode(WIFI_STA);
  ensureWifiConnected();

  Serial.println("[boot] actuators OFF; pump=33 fan=26 active-LOW");
}

void loop() {
  ensureWifiConnected();

  const bool mqttConnected = ensureMqttConnected();
  if (mqttWasConnected && !mqttConnected) {
    actuatorStopAll();
    publishState();
  }
  mqttWasConnected = mqttConnected;

  mqtt.loop();

  if (actuatorTick()) {
    publishState();
  }

  const unsigned long now = nowMs();
  if (mqttConnected && (now - lastTelemetryMs >= PLANTY_TELEMETRY_INTERVAL_MS)) {
    lastTelemetryMs = now;
    publishTelemetry();
  }
}