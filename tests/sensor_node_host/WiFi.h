#pragma once
#include "Arduino.h"
constexpr int WIFI_STA = 1, WIFI_IF_STA = 0;
struct WiFiMock {
  bool mode(int) { return true; }
  bool setSleep(bool) { return true; }
  std::string macAddress() { return "02:00:00:00:00:01"; }
};
extern WiFiMock WiFi;
