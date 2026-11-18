// Register-level BH1750/TCS34725 drivers. Conversion waits use millis(), never delay().
#include "sensors.h"

#include <Arduino.h>
#include <Wire.h>

#include "node_config.h"

namespace sensors {
namespace {
constexpr uint8_t kAddrBh1750 = 0x23;
constexpr uint8_t kAddrTcs34725 = 0x29;
constexpr uint16_t kBusTimeoutMs = 5;
constexpr uint32_t kBhConversionMs = 180;
constexpr uint8_t kTcsAtime = 0xD6;  // 42 cycles, 100.8 ms
// 16x: at 1x a ~35 lx room reads c≈6 counts, too coarse for a stable CCT. 16x keeps a desk
// (300-1000 lx) well inside the 43008-count ceiling; brighter light saturates and reports cct=0.
constexpr uint8_t kTcsGain = 0x02;
constexpr uint32_t kTcsConversionMs = 110;
constexpr uint16_t kTcsSaturation = 42 * 1024;
constexpr bool kTcsOwnBus =
    nodecfg::kPinTcsSda != nodecfg::kPinSda || nodecfg::kPinTcsScl != nodecfg::kPinScl;
// The longest read() path initializes both parts: 3 BH commands + 6 TCS transactions.
static_assert(9 * kBusTimeoutMs <= nodecfg::kSensorReadBudgetMs, "I2C exceeds read budget");

bool bh1750_present = false;
bool tcs_present = false;
bool bhConfigured = false;
uint32_t bhStartedMs = 0;
uint32_t bhReadMs = 0;
enum class TcsPhase { Off, Powering, Integrating };
TcsPhase tcsPhase = TcsPhase::Off;
uint32_t tcsStartedMs = 0;
uint32_t tcsReadMs = 0;

using Bus = decltype(Wire);  // TwoWire on the target

// The colour sensor uses the second controller when it has its own pins.
Bus &tcsBus() { return kTcsOwnBus ? Wire1 : Wire; }

bool deviceResponds(Bus &bus, uint8_t addr) {
  bus.beginTransmission(addr);
  return bus.endTransmission() == 0;
}

bool bhCommand(uint8_t command) {
  Wire.beginTransmission(kAddrBh1750);
  Wire.write(command);
  return Wire.endTransmission() == 0;
}

bool tcsWrite(uint8_t reg, uint8_t value) {
  Bus &bus = tcsBus();
  bus.beginTransmission(kAddrTcs34725);
  bus.write(0x80 | reg);
  bus.write(value);
  return bus.endTransmission() == 0;
}

bool tcsRead(uint8_t reg, uint8_t *data, uint8_t count) {
  Bus &bus = tcsBus();
  bus.beginTransmission(kAddrTcs34725);
  bus.write(0xA0 | reg);  // command + auto-increment, repeated START
  if (bus.endTransmission(false) != 0) return false;
  if (bus.requestFrom(kAddrTcs34725, count) != count) return false;
  for (uint8_t i = 0; i < count; ++i) data[i] = static_cast<uint8_t>(bus.read());
  return true;
}

uint16_t word(const uint8_t *data) {
  return static_cast<uint16_t>(data[0]) | (static_cast<uint16_t>(data[1]) << 8);
}

uint16_t colorTemperature(const SensorSample &v) {
  // DN40 IR-corrected estimate. Zero means unavailable, not a physical 0 K.
  if (v.c == 0 || v.c >= kTcsSaturation || v.r >= kTcsSaturation ||
      v.g >= kTcsSaturation || v.b >= kTcsSaturation) return 0;
  int32_t ir = (static_cast<int32_t>(v.r) + v.g + v.b - v.c) / 2;
  if (ir < 0) ir = 0;
  const int32_t red = static_cast<int32_t>(v.r) - ir;
  const int32_t blue = static_cast<int32_t>(v.b) - ir;
  if (red <= 0 || blue < 0) return 0;
  const float kelvin = 3810.0f * blue / red + 1391.0f;
  if (kelvin > 65535.0f) return 0;
  return static_cast<uint16_t>(kelvin + 0.5f);
}

bool readBh1750(SensorSample &out) {
  if (!bhConfigured) {
    if (!bhCommand(0x01) || !bhCommand(0x07) || !bhCommand(0x10)) {
      bh1750_present = false;
      return false;
    }
    bhConfigured = true;
    bhStartedMs = bhReadMs = millis();
    return false;
  }
  if (millis() - bhStartedMs < kBhConversionMs || millis() - bhReadMs < kBhConversionMs) {
    return false;
  }
  if (Wire.requestFrom(kAddrBh1750, uint8_t(2)) != 2) {
    bhConfigured = false;
    bh1750_present = false;
    return false;
  }
  const uint16_t hi = static_cast<uint16_t>(Wire.read());
  const uint16_t raw = (hi << 8) | static_cast<uint16_t>(Wire.read());
  bhReadMs = millis();
  if (raw == 0xFFFF) return false;  // saturated; do not control the lamp from a clipped value
  out.lux = raw / 1.2f;  // default MTreg = 69; a real zero is a valid dark reading
  return true;
}

bool readTcs34725(SensorSample &out) {
  if (tcsPhase == TcsPhase::Off) {
    uint8_t id = 0;
    if (!tcsRead(0x12, &id, 1) || (id != 0x44 && id != 0x4D) ||
        !tcsWrite(0x00, 0x00) || !tcsWrite(0x01, kTcsAtime) ||
        !tcsWrite(0x0F, kTcsGain) || !tcsWrite(0x00, 0x01)) {
      tcs_present = false;
      return false;
    }
    tcsPhase = TcsPhase::Powering;
    tcsStartedMs = millis();
    return false;
  }
  if (tcsPhase == TcsPhase::Powering) {
    if (millis() - tcsStartedMs < 3) return false;  // PON must precede AEN by >= 2.4 ms
    if (!tcsWrite(0x00, 0x03)) {
      tcsPhase = TcsPhase::Off;
      tcs_present = false;
      return false;
    }
    tcsPhase = TcsPhase::Integrating;
    tcsStartedMs = tcsReadMs = millis();
    return false;
  }
  if (millis() - tcsStartedMs < kTcsConversionMs || millis() - tcsReadMs < kTcsConversionMs) {
    return false;
  }
  uint8_t status = 0;
  uint8_t data[8];
  if (!tcsRead(0x13, &status, 1)) {
    tcsPhase = TcsPhase::Off;
    tcs_present = false;
    return false;
  }
  if (!(status & 0x01)) return false;  // AVALID: do not reuse invalid conversion data
  if (!tcsRead(0x14, data, sizeof(data))) {
    tcsPhase = TcsPhase::Off;
    tcs_present = false;
    return false;
  }
  tcsReadMs = millis();
  out.c = word(data);
  out.r = word(data + 2);
  out.g = word(data + 4);
  out.b = word(data + 6);
  out.cct = colorTemperature(out);
  return true;
}
}  // namespace

void begin() {
  bhConfigured = false;
  tcsPhase = TcsPhase::Off;
  Wire.begin(nodecfg::kPinSda, nodecfg::kPinScl);
  Wire.setTimeOut(kBusTimeoutMs);
  if (kTcsOwnBus) {
    Wire1.begin(nodecfg::kPinTcsSda, nodecfg::kPinTcsScl);
    Wire1.setTimeOut(kBusTimeoutMs);
  }
  reportPresence();
}

void reportPresence() {
  bh1750_present = deviceResponds(Wire, kAddrBh1750);
  tcs_present = deviceResponds(tcsBus(), kAddrTcs34725);
  if (!bh1750_present) bhConfigured = false;
  if (!tcs_present) tcsPhase = TcsPhase::Off;
  Serial.printf("[sensor] BH1750 %s (0x23, SDA=%d SCL=%d), TCS34725 %s (0x29, SDA=%d SCL=%d)\n",
                bh1750_present ? "found" : "missing", nodecfg::kPinSda, nodecfg::kPinScl,
                tcs_present ? "found" : "missing", nodecfg::kPinTcsSda, nodecfg::kPinTcsScl);
}

bool read(SensorSample &out) {
  out = SensorSample{};
  if (bh1750_present) out.bh1750Ok = readBh1750(out);
  if (tcs_present) out.tcsOk = readTcs34725(out);
  return out.bh1750Ok || out.tcsOk;
}

bool lightSensorPresent() { return bh1750_present; }
}  // namespace sensors
