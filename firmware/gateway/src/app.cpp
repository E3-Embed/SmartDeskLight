#include "app.h"

#include <stdarg.h>
#include <string.h>
#include <time.h>

namespace app {

State state;
SemaphoreHandle_t stateMutex = nullptr;
QueueHandle_t qTelemetry = nullptr;
QueueHandle_t qControl = nullptr;
QueueHandle_t qCloud = nullptr;
QueueHandle_t qAlerts = nullptr;
EventGroupHandle_t events = nullptr;

void init() {
  stateMutex = xSemaphoreCreateMutex();
  qTelemetry = xQueueCreate(32, sizeof(SdlTelemetry));
  qControl = xQueueCreate(8, sizeof(ControlEvent));
  qCloud = xQueueCreate(32, sizeof(TelemetryRecord));
  qAlerts = xQueueCreate(8, sizeof(Alert));
  events = xEventGroupCreate();
  configASSERT(stateMutex && qTelemetry && qControl && qCloud && qAlerts && events);
}

const char *modeName(Mode m) {
  switch (m) {
    case Mode::Coding: return "coding";
    case Mode::Drawing: return "drawing";
    default: return "reading";
  }
}

bool modeFromString(const char *s, Mode &out) {
  if (!s) return false;
  if (!strcmp(s, "reading")) { out = Mode::Reading; return true; }
  if (!strcmp(s, "coding")) { out = Mode::Coding; return true; }
  if (!strcmp(s, "drawing")) { out = Mode::Drawing; return true; }
  return false;
}

void raiseAlert(const char *fmt, ...) {
  Alert a;
  va_list args;
  va_start(args, fmt);
  vsnprintf(a.text, sizeof(a.text), fmt, args);
  va_end(args);
  Serial.printf("[alert] %s\n", a.text);
  xQueueSend(qAlerts, &a, 0);  // never block the caller; drop if the queue is full
}

void requestAiProfile() { xEventGroupSetBits(events, kBitAiRequest); }

uint32_t nowEpoch() {
  time_t t = time(nullptr);
  return t > 1700000000 ? static_cast<uint32_t>(t) : 0;  // before sync the clock starts at 1970
}

}  // namespace app
