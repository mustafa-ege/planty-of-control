#pragma once

#include <Arduino.h>

// Initialize GPIO and force actuators off (call from setup).
void actuatorInit();

// Call every loop() to honor timed shutoffs and publish state when they end.
bool actuatorTick();

// Apply commands (return false if rejected e.g. invalid duration or cooldown).
bool actuatorPump(bool on, unsigned long durationMs);
bool actuatorFan(bool on, unsigned long durationMs);
void actuatorStopAll();

bool actuatorIsPumpOn();
bool actuatorIsFanOn();
