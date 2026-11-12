#include "ina219.h"

namespace {
constexpr uint8_t kRegConfig = 0x00;
constexpr uint8_t kRegBusVoltage = 0x02;
constexpr uint8_t kRegPower = 0x03;
constexpr uint8_t kRegCurrent = 0x04;
constexpr uint8_t kRegCalibration = 0x05;

constexpr uint16_t kConfigReset = 0x8000;
// BRNG=1 (32 V range) | PG=11 (+-320 mV shunt) | BADC=0011 (12-bit) | SADC=0011 (12-bit)
// | MODE=111 (shunt and bus, continuous)  -> 0x399F
constexpr uint16_t kConfigValue = 0x399F;
}  // namespace

bool Ina219::begin(float shuntOhms, float maxCurrentA) {
  if (!writeRegister(kRegConfig, kConfigReset)) return false;
  delay(2);

  // Datasheet section 8.5.1:
  //   Current_LSB = Max_Expected_I / 2^15
  //   Cal         = trunc(0.04096 / (Current_LSB * R_shunt))
  //   Power_LSB   = 20 * Current_LSB
  currentLsbA_ = maxCurrentA / 32768.0f;
  calibration_ = static_cast<uint16_t>(0.04096f / (currentLsbA_ * shuntOhms));
  currentLsbA_ = 0.04096f / (calibration_ * shuntOhms);  // exact LSB after truncation
  powerLsbW_ = 20.0f * currentLsbA_;

  return writeRegister(kRegCalibration, calibration_) && writeRegister(kRegConfig, kConfigValue);
}

bool Ina219::read(float &busV, float &currentMa, float &powerMw) {
  // A brown-out resets the chip to Cal = 0, which makes Current/Power read 0.
  // Re-writing the calibration before each read keeps the values valid.
  if (!writeRegister(kRegCalibration, calibration_)) return false;

  uint16_t rawBus, rawCurrent, rawPower;
  if (!readRegister(kRegBusVoltage, rawBus) || !readRegister(kRegCurrent, rawCurrent) ||
      !readRegister(kRegPower, rawPower)) {
    return false;
  }
  if (rawBus & 0x0001) return false;  // OVF: power or current calculation overflowed

  busV = static_cast<float>(rawBus >> 3) * 0.004f;  // bits 15..3, 4 mV per bit
  currentMa = static_cast<int16_t>(rawCurrent) * currentLsbA_ * 1000.0f;  // signed
  powerMw = rawPower * powerLsbW_ * 1000.0f;
  return true;
}

bool Ina219::writeRegister(uint8_t reg, uint16_t value) {
  wire_.beginTransmission(addr_);
  wire_.write(reg);
  wire_.write(static_cast<uint8_t>(value >> 8));
  wire_.write(static_cast<uint8_t>(value & 0xFF));
  return wire_.endTransmission() == 0;
}

bool Ina219::readRegister(uint8_t reg, uint16_t &value) {
  // Set the register pointer, then read two bytes MSB first.
  wire_.beginTransmission(addr_);
  wire_.write(reg);
  if (wire_.endTransmission(false) != 0) return false;  // repeated start
  if (wire_.requestFrom(addr_, static_cast<uint8_t>(2)) != 2) return false;
  value = (static_cast<uint16_t>(wire_.read()) << 8) | wire_.read();
  return true;
}
