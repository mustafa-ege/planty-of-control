#include "actuator.h"
#include "planty_config.h"

namespace {

bool pumpOn = false;
bool fanOn = false;
unsigned long pumpOffAt = 0;
unsigned long fanOffAt = 0;
unsigned long lastPumpStartMs = 0;

void relayWrite(int pin, bool on) {
#if PLANTY_RELAY_ACTIVE_LOW
  digitalWrite(pin, on ? LOW : HIGH);
#else
  digitalWrite(pin, on ? HIGH : LOW);
#endif
}

bool durationValid(unsigned long durationMs, unsigned long maxMs) {
  return durationMs >= PLANTY_PUMP_DURATION_MIN_MS && durationMs <= maxMs;
}

}  // namespace

void actuatorInit() {
  // Drive safe (OFF) level before enabling outputs
#if PLANTY_RELAY_ACTIVE_LOW
  digitalWrite(PLANTY_PUMP_PIN, HIGH);
  digitalWrite(PLANTY_FAN_PIN, HIGH);
#else
  digitalWrite(PLANTY_PUMP_PIN, LOW);
  digitalWrite(PLANTY_FAN_PIN, LOW);
#endif
  pinMode(PLANTY_PUMP_PIN, OUTPUT);
  pinMode(PLANTY_FAN_PIN, OUTPUT);
  actuatorStopAll();
}

void actuatorStopAll() {
  relayWrite(PLANTY_PUMP_PIN, false);
  relayWrite(PLANTY_FAN_PIN, false);
  pumpOn = false;
  fanOn = false;
  pumpOffAt = 0;
  fanOffAt = 0;
}

bool actuatorIsPumpOn() { return pumpOn; }
bool actuatorIsFanOn() { return fanOn; }

bool actuatorPump(bool on, unsigned long durationMs) {
  const unsigned long now = millis();

  if (!on) {
    relayWrite(PLANTY_PUMP_PIN, false);
    pumpOn = false;
    pumpOffAt = 0;
    return true;
  }

  if (!durationValid(durationMs, PLANTY_PUMP_DURATION_MAX_MS)) {
    Serial.printf("[actuator] pump REJECT durationMs=%lu (allowed %u-%u)\n", durationMs,
                  PLANTY_PUMP_DURATION_MIN_MS, PLANTY_PUMP_DURATION_MAX_MS);
    return false;
  }

  if (lastPumpStartMs > 0 && (now - lastPumpStartMs) < PLANTY_PUMP_COOLDOWN_MS) {
    Serial.println("[actuator] pump REJECT cooldown");
    return false;
  }

  relayWrite(PLANTY_PUMP_PIN, true);
  pumpOn = true;
  pumpOffAt = now + durationMs;
  lastPumpStartMs = now;
  Serial.printf("[actuator] pump ON %lums\n", durationMs);
  return true;
}

bool actuatorFan(bool on, unsigned long durationMs) {
  const unsigned long now = millis();

  if (!on) {
    relayWrite(PLANTY_FAN_PIN, false);
    fanOn = false;
    fanOffAt = 0;
    return true;
  }

  unsigned long dur = durationMs;
  if (dur == 0) {
    dur = PLANTY_FAN_DURATION_MAX_MS;
  } else if (!durationValid(dur, PLANTY_FAN_DURATION_MAX_MS)) {
    return false;
  }

  relayWrite(PLANTY_FAN_PIN, true);
  fanOn = true;
  fanOffAt = now + dur;
  return true;
}

bool actuatorTick() {
  const unsigned long now = millis();
  bool changed = false;

  if (pumpOn && pumpOffAt > 0 && now >= pumpOffAt) {
    relayWrite(PLANTY_PUMP_PIN, false);
    pumpOn = false;
    pumpOffAt = 0;
    changed = true;
    Serial.println("[actuator] pump OFF (timer)");
  }

  if (fanOn && fanOffAt > 0 && now >= fanOffAt) {
    relayWrite(PLANTY_FAN_PIN, false);
    fanOn = false;
    fanOffAt = 0;
    changed = true;
    Serial.println("[actuator] fan OFF (timer)");
  }

  return changed;
}
