#include "lamp.h"

#include <Arduino.h>
#include <ESP32Servo.h>

#include "config.h"

namespace lamp {
namespace {

Servo servos[3];
ESP32PWM ledPwm;
bool current[3] = {false, false, false};
bool attached[3] = {false, false, false};
uint32_t movedAtMs = 0;
uint32_t lastChangeMs = 0;
bool everMoved = false;
uint8_t duty = 0;

int clampAngle(int deg) {
  if (deg < cfg::kServoMinDeg) return cfg::kServoMinDeg;
  if (deg > cfg::kServoMaxDeg) return cfg::kServoMaxDeg;
  return deg;
}

void moveServo(int i, bool in) {
  if (!attached[i]) {
    servos[i].setPeriodHertz(50);
    servos[i].attach(cfg::kPinServo[i], 500, 2400);  // SG90 / MG90S pulse range
    attached[i] = true;
  }
  servos[i].write(clampAngle(in ? cfg::kServoInDeg : cfg::kServoOutDeg));
  current[i] = in;
}

}  // namespace

void begin() {
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ledPwm.attachPin(cfg::kPinLedPwm, cfg::kLedPwmFreqHz, cfg::kLedPwmBits);
  setPwm(0);
  // Start from a known position: every filter out of the light path.
  const bool allOut[3] = {false, false, false};
  setFilters(allOut, true);
}

bool setFilters(const bool want[3], bool force) {
  bool changed = false;
  for (int i = 0; i < 3; i++) changed |= (want[i] != current[i]);
  if (!changed && everMoved) return false;

  uint32_t now = millis();
  if (!force && everMoved && now - lastChangeMs < cfg::kServoMinIntervalMs) return false;

  for (int i = 0; i < 3; i++) {
    if (want[i] != current[i] || !everMoved) moveServo(i, want[i]);
  }
  everMoved = true;
  lastChangeMs = now;
  movedAtMs = now;
  Serial.printf("[lamp] filters diffuser=%d nd=%d warm=%d\n", current[0], current[1], current[2]);
  return true;
}

void setPwm(uint8_t value) {
  duty = value;
  ledPwm.write(value);
}

uint8_t pwm() { return duty; }
const bool *filters() { return current; }

void enterSafeState() {
  const bool allOut[3] = {false, false, false};
  setFilters(allOut, true);
  setPwm(cfg::kSafePwm);
}

void service() {
  if (millis() - movedAtMs < cfg::kServoSettleMs) return;
  for (int i = 0; i < 3; i++) {
    if (attached[i]) {
      servos[i].detach();
      attached[i] = false;
    }
  }
}

}  // namespace lamp
