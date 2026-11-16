// I2C sensors of the sensor node — register-level drivers (E8), same style as the gateway's
// ina219.cpp: raw bus transactions plus the datasheet maths, no sensor library.
//
// Both parts are already wired to nodecfg::kPinSda / kPinScl:
//   BH1750   0x23  ambient light, lx           — feeds the closed control loop
//   TCS34725 0x29  RGBC + clear channels       — colour temperature
//
// Status: skeleton. The bus comes up and both addresses are probed, but read() still returns
// false so the node sends heartbeats only. Implement the two TODO blocks below.
#include "sensors.h"

#include <Arduino.h>
#include <Wire.h>

#include "node_config.h"

namespace sensors {
namespace {

constexpr uint8_t kAddrBh1750 = 0x23;
constexpr uint8_t kAddrTcs34725 = 0x29;

bool bh1750_present = false;
bool tcs_present = false;

bool deviceResponds(uint8_t addr) {
  Wire.beginTransmission(addr);
  return Wire.endTransmission() == 0;
}

// TODO(BH1750): power on (0x01), then continuous high-resolution mode (0x10). A measurement
// takes ~120 ms at that resolution — too long for the loop's budget, so either start the
// conversion one read() call and collect the next (pipelined), or drop to low-res (~16 ms).
// High-res lx = raw / 1.2.
bool readBh1750(SensorSample &out) {
  (void)out;
  return false;
}

// TODO(TCS34725): enable the ADC (PON | AEN), wait out the integration time, then read the
// 8 bytes of RGBC data. Keep the integration time inside kSensorReadBudgetMs; it is the knob
// the datasheet exposes (2.4 ms steps), and the default is far too slow for this loop.
// Colour temperature comes from the McCamy approximation over the CIE xy point derived from
// the compensated channels — keep the raw r/g/b/c in the sample regardless, they are useful
// on their own.
bool readTcs34725(SensorSample &out) {
  (void)out;
  return false;
}

}  // namespace

void begin() {
  Wire.begin(nodecfg::kPinSda, nodecfg::kPinScl);
  // Bound every transaction: a held-low SDA must fail the read, not stall the heartbeat.
  Wire.setTimeOut(nodecfg::kSensorReadBudgetMs);

  bh1750_present = deviceResponds(kAddrBh1750);
  tcs_present = deviceResponds(kAddrTcs34725);
  Serial.printf("[sensor] BH1750 %s, TCS34725 %s\n", bh1750_present ? "found" : "missing",
                tcs_present ? "found" : "missing");
}

bool read(SensorSample &out) {
  out = SensorSample{};
  if (bh1750_present) out.bh1750Ok = readBh1750(out);
  if (tcs_present) out.tcsOk = readTcs34725(out);
  return out.bh1750Ok || out.tcsOk;
}

bool lightSensorPresent() { return bh1750_present; }

}  // namespace sensors
