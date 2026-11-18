// Sampling seam for the node's I2C sensors (E8).
//
// Register-level drivers live in sensors.cpp. Link discovery, heartbeat, ACK/retry and the
// status LED use this interface without depending on sensor registers.
//
// Contract for read():
//   - it is called from loop(), in the same task that talks ESP-NOW, so it must not block
//     for more than nodecfg::kSensorReadBudgetMs;
//   - a failed or missing sensor must leave its *Ok flag false. Reporting a failed lux read
//     as a valid zero would make the control loop treat it as a dark room;
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

// Re-probe and print I2C presence so USB reconnects do not hide the boot result.
void reportPresence();

// One reading set. Returns false if neither sensor answered.
bool read(SensorSample &out);

// True after the latest presence probe/read saw BH1750. A valid dark reading can be 0 lx.
bool lightSensorPresent();

// True after the latest presence probe/read saw TCS34725.
bool colorSensorPresent();

}  // namespace sensors
