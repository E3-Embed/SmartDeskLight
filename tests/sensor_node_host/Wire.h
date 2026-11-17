#pragma once
#include "Arduino.h"
#include <vector>
struct WireMock {
  uint8_t address = 0, reg = 0;
  bool bhMissing = false, tcsMissing = false, shortRead = false, valid = true;
  uint8_t id = 0x44;
  uint16_t luxRaw = 1200, red = 1000, green = 1500, blue = 1200, clear = 4000;
  uint32_t transactionMs = 0;
  uint16_t timeoutMs = 0;
  std::vector<uint8_t> tx, rx;
  std::vector<std::vector<uint8_t>> writes;
  size_t cursor = 0;
  int begins = 0;
  void begin(int sda, int scl) {
    // BH1750 bus on 8/9; the TCS34725 bus on 10/11 when it has its own controller.
    if (!((sda == 8 && scl == 9) || (sda == 10 && scl == 11))) throw "wrong pins";
    ++begins;
  }
  void setTimeOut(uint16_t ms) { timeoutMs = ms; }
  void beginTransmission(uint8_t a) { address = a; tx.clear(); }
  size_t write(uint8_t b) { tx.push_back(b); return 1; }
  bool missing(uint8_t a) const { return a == 0x23 ? bhMissing : tcsMissing; }
  int endTransmission(bool = true) {
    fakeTime += transactionMs;
    if (!tx.empty()) { reg = tx[0] & 0x1F; writes.push_back(tx); }
    return missing(address) ? 2 : 0;
  }
  uint8_t requestFrom(uint8_t a, uint8_t count) {
    fakeTime += transactionMs;
    rx.clear(); cursor = 0;
    if (missing(a) || shortRead) return 0;
    if (a == 0x23) rx = {uint8_t(luxRaw >> 8), uint8_t(luxRaw)};
    else if (reg == 0x12) rx = {id};
    else if (reg == 0x13) rx = {uint8_t(valid)};
    else if (reg == 0x14) {
      for (uint16_t x : {clear, red, green, blue}) {
        rx.push_back(uint8_t(x)); rx.push_back(uint8_t(x >> 8));
      }
    }
    return rx.size() == count ? count : 0;
  }
  int read() { return rx.at(cursor++); }
};
extern WireMock Wire;
extern WireMock &Wire1;  // same simulated devices; addresses keep the two sensors apart
