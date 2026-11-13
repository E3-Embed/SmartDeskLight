// Shared types, queues and state for the gateway tasks.
//
// Ownership rules (keep these in mind when answering "who writes what?"):
//   - EspNowRxTask writes node readings, SensorTask writes local sensor readings,
//     ControlTask writes lamp state and the active profile, CloudTask only reads.
//   - Every access to `app::state` goes through StateLock (a FreeRTOS mutex).
//   - Tasks talk to each other through queues; ISRs and radio callbacks only enqueue.
#pragma once
#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/event_groups.h>
#include <freertos/queue.h>
#include <freertos/semphr.h>

#include "config.h"
#include "message.h"

namespace app {

enum class Mode : uint8_t { Reading, Coding, Drawing };
const char *modeName(Mode m);
bool modeFromString(const char *s, Mode &out);

// Lighting target produced by the AI (or by the rule-based fallback).
struct Profile {
  float targetLux = 500.0f;
  uint16_t targetCct = 4000;
  bool filters[3] = {true, false, false};  // diffuser, ND, warm/CTO
  bool fromAi = false;
};

struct NodeState {
  bool used = false;
  uint8_t id = 0;
  uint32_t lastSeq = 0;
  uint32_t lastSeenMs = 0;
  uint32_t received = 0;    // unique packets (for packet delivery rate)
  uint32_t duplicates = 0;  // retries that arrived twice
  float lux = 0;
  uint16_t cct = 0;
  bool lostAlerted = false;
};

struct LocalSensors {
  uint16_t distMm = 0;
  bool distOk = false;
  bool presence = false;
  uint32_t lastPresenceMs = 0;
  float busV = 0, currentMa = 0, powerMw = 0;
  bool inaOk = false;
};

struct LampState {
  bool filters[3] = {false, false, false};
  uint8_t pwm = 0;
  bool safe = false;  // safe state (stop button or fault)
};

struct State {
  NodeState nodes[cfg::kMaxNodes];
  LocalSensors local;
  LampState lamp;
  Profile profile;
  Mode mode = Mode::Reading;
  int8_t feedback[cfg::kFeedbackHistory] = {};  // +1 too bright, -1 too dim (newest first)
  uint8_t feedbackCount = 0;
  bool cloudUp = false;
  uint32_t bufferedReadings = 0;
};

// ---- messages between tasks
enum class EventType : uint8_t { StopButton, SetMode, Feedback, NewProfile };
struct ControlEvent {
  EventType type;
  Mode mode;        // SetMode
  int8_t feedback;  // Feedback: +1 too bright, -1 too dim
  Profile profile;  // NewProfile
};

struct TelemetryRecord {
  SdlTelemetry pkt;
  uint32_t epoch;  // gateway wall-clock time when received (0 if NTP not synced yet)
};

struct Alert {
  char text[112];
};

// Event-group bits
constexpr EventBits_t kBitWifiUp = BIT0;
constexpr EventBits_t kBitMqttUp = BIT1;
constexpr EventBits_t kBitAiRequest = BIT2;
// Set once setup() has finished its first association attempt, so the status LED can tell
// "still trying to join" (white pulse) from "the attempt failed" (red blink).
constexpr EventBits_t kBitWifiTried = BIT3;

extern State state;
extern SemaphoreHandle_t stateMutex;
extern QueueHandle_t qTelemetry;  // radio callback -> EspNowRxTask   (SdlTelemetry)
extern QueueHandle_t qControl;    // ISR / cloud -> ControlTask       (ControlEvent)
extern QueueHandle_t qCloud;      // EspNowRxTask -> CloudTask        (TelemetryRecord)
extern QueueHandle_t qAlerts;     // any task -> CloudTask            (Alert)
extern EventGroupHandle_t events;

void init();  // create queues, mutex and event group (call once, before tasks start)

class StateLock {
 public:
  StateLock() { xSemaphoreTake(stateMutex, portMAX_DELAY); }
  ~StateLock() { xSemaphoreGive(stateMutex); }
  StateLock(const StateLock &) = delete;
  StateLock &operator=(const StateLock &) = delete;
};

void raiseAlert(const char *fmt, ...);
void requestAiProfile();
uint32_t nowEpoch();  // 0 until NTP has synced

}  // namespace app
