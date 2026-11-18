#pragma once
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <math.h>
#include <string>
#include <string.h>
extern uint32_t fakeTime;
inline uint32_t millis() { return fakeTime; }
inline void delay(uint32_t ms) { fakeTime += ms; }
using portMUX_TYPE = int;
#define portMUX_INITIALIZER_UNLOCKED 0
inline void portENTER_CRITICAL(portMUX_TYPE *) {}
inline void portEXIT_CRITICAL(portMUX_TYPE *) {}
inline void xTaskCreatePinnedToCore(void (*)(void *), const char *, int, void *, int, void *, int) {}
inline float temperatureRead() { return 35.0f; }
struct EspMock {
  uint32_t getFreeHeap() { return 200000; }
  uint32_t getMinFreeHeap() { return 180000; }
  void restart() {}
};
extern EspMock ESP;
struct SerialMock {
  void begin(int) {}
  void println(const char *) {}
  template<class... T> void printf(const char *, T...) {}
};
extern SerialMock Serial;
