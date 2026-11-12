// INA219 current / power monitor — our own register-level I2C driver (E8).
//
// Registers (datasheet SBOS448):
//   0x00 Configuration   0x01 Shunt voltage   0x02 Bus voltage
//   0x03 Power           0x04 Current         0x05 Calibration
// All registers are 16-bit, big-endian (MSB first).
#pragma once
#include <Arduino.h>
#include <Wire.h>

class Ina219 {
 public:
  explicit Ina219(TwoWire &wire, uint8_t address = 0x40) : wire_(wire), addr_(address) {}

  // shuntOhms: value of the shunt resistor on the module (0.1 ohm on common boards).
  // maxCurrentA: largest current we expect; sets the resolution (Current_LSB).
  bool begin(float shuntOhms = 0.1f, float maxCurrentA = 2.0f);

  // Reads bus voltage [V], current [mA] and power [mW]. Returns false on I2C error
  // or when the chip reports a math overflow (OVF bit).
  bool read(float &busV, float &currentMa, float &powerMw);

 private:
  bool writeRegister(uint8_t reg, uint16_t value);
  bool readRegister(uint8_t reg, uint16_t &value);

  TwoWire &wire_;
  uint8_t addr_;
  uint16_t calibration_ = 0;
  float currentLsbA_ = 0;  // amps per bit of the Current register
  float powerLsbW_ = 0;    // watts per bit of the Power register (= 20 x Current_LSB)
};
