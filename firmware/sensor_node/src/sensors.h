// Sampling seam for the node's I2C sensors (E8).
//
// main.cpp only knows this interface: fill in sensors.cpp and the rest of the firmware —
// link discovery, heartbeat, ACK/retry, status LED — keeps working untouched.
//
// Contract for read():
//   - it is called from loop(), in the same task that talks ESP-NOW, so it must not block
//     for more than nodecfg::kSensorReadBudgetMs;
//   - set the per-sensor *Ok flags honestly. lux = 0 with bh1750Ok = true is a lie the
//     control loop acts on (it reads as "pitch black" and drives the lamp to full power),
//     so a failed or missing sensor must leave its flag false;
//   - return true if at least one sensor produced a fresh value.
#pragma once
#include <stdint.h>

struct SensorSample {
  bool bh1750Ok = false;
  bool tcsOk = false;
  float lux = 0.0f;                      // BH1750, lx
  uint16_t r = 0, g = 0, b = 0, c = 0;   // TCS34725 raw channels
  uint16_t cct = 0;                      // TCS34725 colour temperature estimate, K
};

namespace sensors {

// Brings up the I2C bus and probes both sensors. Safe to call once from setup().
void begin();

// One reading set. Returns false if neither sensor answered.
bool read(SensorSample &out);

// True once begin() has seen the sensor that feeds the control loop (BH1750).
bool lightSensorPresent();

}  // namespace sensors
