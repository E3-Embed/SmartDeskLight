// SmartDeskLight gateway — build-time configuration.
// Pins follow the pin map in docs/hardware.md. Change them in one place only: here.
#pragma once
#include <stdint.h>

namespace cfg {

// ---------------------------------------------------------------- pins
constexpr int kPinSda = 21;
constexpr int kPinScl = 22;
constexpr int kPinPir = 34;          // input-only pin, PIR has its own driver stage
constexpr int kPinStopButton = 4;    // INPUT_PULLUP, active low
constexpr int kPinServo[3] = {25, 26, 27};  // 0 = diffuser, 1 = ND, 2 = warm/CTO
constexpr int kPinLedPwm = 18;       // dimming input of the constant-current LED driver
constexpr int kPinStatusLed = 2;     // on-board LED

// ---------------------------------------------------------------- servos / filters
constexpr int kServoOutDeg = 10;     // filter folded out of the light path
constexpr int kServoInDeg = 100;     // filter in the light path
constexpr int kServoMinDeg = 0;      // software limits; mechanical end stops sit just beyond
constexpr int kServoMaxDeg = 120;
constexpr uint32_t kServoSettleMs = 700;        // detach after this long (move timeout, no jitter)
constexpr uint32_t kServoMinIntervalMs = 10000; // rate limit: at most one filter change per 10 s

// ---------------------------------------------------------------- LED PWM
constexpr uint32_t kLedPwmFreqHz = 5000;
constexpr uint8_t kLedPwmBits = 8;   // duty 0..255
constexpr uint8_t kSafePwm = 128;    // "LED at medium" in the safe state

// ---------------------------------------------------------------- control loop
constexpr uint32_t kControlPeriodMs = 200;
constexpr float kLuxTolerance = 0.07f;   // hold when |error| < 7 % of target
constexpr float kKp = 0.08f;             // PWM steps per lux of error
constexpr float kMaxPwmStep = 12.0f;     // limit per control period (smooth changes)
constexpr float kMinTargetLux = 200.0f;  // AI output is clamped to this range
constexpr float kMaxTargetLux = 750.0f;
constexpr uint8_t kPrimaryNodeId = 1;    // node whose lux closes the loop
constexpr uint32_t kNodeStaleMs = 10000; // no packet for 10 s -> sensor fault
constexpr uint32_t kNodeLostMs = 30000;  // no packet for 30 s -> "node lost" alert
constexpr uint32_t kPresenceTimeoutMs = 5UL * 60UL * 1000UL;  // dim when nobody is at the desk
constexpr int kFeedbackHistory = 5;
constexpr float kFeedbackStep = 0.15f;   // "too bright / too dim" changes target by 15 %

// ---------------------------------------------------------------- nodes / ESP-NOW
constexpr int kMaxNodes = 8;
constexpr int kSimulatedNodes = 0;       // set to 2 for the "1 physical + 2 simulated" test
constexpr uint8_t kFirstSimulatedId = 101;

// ---------------------------------------------------------------- cloud
constexpr const char *kMqttHost = "mqtt.netpie.io";
constexpr uint16_t kMqttPort = 1884;     // NETPIE2020 MQTTS
constexpr uint32_t kShadowPeriodMs = 30000;  // NETPIE free tier: ~86k shadow writes/month (quota 500k)
constexpr uint32_t kAiPeriodMs = 5UL * 60UL * 1000UL;
constexpr int kBufferSlots = 300;        // store-and-forward: ~5 min of 1 Hz readings (~11 kB)
constexpr const char *kAiModel = "gemini-2.5-flash";
constexpr long kUtcOffsetSec = 7L * 3600L;  // Asia/Bangkok
constexpr const char *kTopicCmd = "@msg/sdl/cmd";
constexpr const char *kTopicAlert = "@msg/sdl/alert";
constexpr const char *kTopicShadow = "@shadow/data/update";

}  // namespace cfg
