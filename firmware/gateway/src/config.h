// SmartDeskLight gateway — build-time configuration.
// Pins follow the pin map in docs/hardware.md. Change them in one place only: here.
#pragma once
#include <stdint.h>

namespace cfg {

// ---------------------------------------------------------------- pins
// ESP32-S3 (DevKitC-1 N8): GPIO 22-25 do not exist, 26-32 are the in-package SPI flash,
// 19/20 are USB, 43/44 are UART0. Valid and free: 1-18, 21, 33-42, 47, 48 (33-37 only
// when the module has no PSRAM — the N8 has none).
constexpr int kPinSda = 8;
constexpr int kPinScl = 9;
constexpr int kPinPir = 34;          // PIR has its own driver stage; 33-37 free on N8 (no PSRAM)
constexpr int kPinStopButton = 4;    // INPUT_PULLUP, active low
// Servos must stay inside 1-21/35-45/47-48: ESP32Servo enforces that list and attach()
// silently fails outside it.
constexpr int kPinServo[3] = {15, 16, 17};  // 0 = diffuser, 1 = ND, 2 = warm/CTO
constexpr int kPinLedPwm = 18;       // dimming input of the constant-current LED driver
constexpr int kPinStatusLed = 2;     // external status LED; the on-board WS2812 is GPIO48
constexpr int kPinRgbLed = 48;       // ESP32-S3-DevKitC-1 on-board WS2812 (single pixel)

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

// ---------------------------------------------------------------- identity
// One name for the network and the broker: DHCP hostname, MQTT client id, and the
// "device" field in telemetry. NETPIE2020 pins the MQTT client id to the device key in
// the console, so the device's Client ID there must match this exactly.
// Rules: <= 32 chars, letters/digits/hyphen only, no spaces.
constexpr const char *kDeviceName = "sdl-gateway";

// ---------------------------------------------------------------- time (SNTP)
// Only used as a wall clock for X.509 validity dates and telemetry timestamps. Tried in
// order; the first that answers sets the clock. On a phone hotspot UDP/123 is often
// filtered, so the direct-IP-style hosts come before the pool's varied servers.
constexpr const char *kNtpServer1 = "time1.nimt.or.th";
constexpr const char *kNtpServer2 = "time.nist.gov";
constexpr const char *kNtpServer3 = "pool.ntp.org";

// ---------------------------------------------------------------- cloud
// Self-hosted EMQX (infra/docker-compose.yml), reached through the NPMplus TLS proxy. Topic
// names keep the @msg/sdl prefix from the original NETPIE layout, but there are no device
// aliases or @shadow conventions to honour on a broker you run yourself.
constexpr const char *kMqttHost = "gw.embed.rachatat.com";
constexpr uint16_t kMqttPort = 8883;  // NPMplus terminates TLS; EMQX itself listens on loopback
// NPMplus serves a publicly-trusted (ACME) certificate that chains to a root in the ESP32's
// built-in bundle (see ca_bundle.h), so the firmware does a normal chain check: no PEM and no
// leaf fingerprint in secrets.h.
constexpr uint32_t kStatePeriodMs = 10000;        // full snapshot on @msg/sdl/gw/state
constexpr uint32_t kGwTelemetryPeriodMs = 2000;   // gateway health on @msg/sdl/gw/telemetry (matches the node heartbeat)
// MQTT PINGREQ interval. The broker declares us dead after 1.5x this, which is also how
// long the retained Last Will on @msg/sdl/gateway/status takes to flip to "offline".
constexpr uint16_t kMqttKeepAliveSec = 30;
constexpr uint32_t kAiPeriodMs = 5UL * 60UL * 1000UL;
constexpr int kBufferSlots = 300;        // store-and-forward: ~5 min of 1 Hz readings (~11 kB)
constexpr const char *kAiModel = "gemini-3.5-flash-lite";  // ~2 s per request; 2.5 models are closed to new users
constexpr long kUtcOffsetSec = 7L * 3600L;  // Asia/Bangkok
constexpr const char *kTopicCmd = "@msg/sdl/cmd";
constexpr const char *kTopicAlert = "@msg/sdl/alert";
// One topic per source. Sensor nodes have no Wi-Fi stack of their own, so the gateway
// republishes on their behalf and node_id says which one it was.
constexpr const char *kTopicGwTelemetry = "@msg/sdl/gw/telemetry";
constexpr const char *kTopicSensorTelemetry = "@msg/sdl/sensor/telemetry";
constexpr const char *kTopicState = "@msg/sdl/gw/state";
// Retained "online"/"offline", driven by the MQTT Last Will, so any dashboard that
// subscribes late still learns the current link state immediately.
constexpr const char *kTopicStatus = "@msg/sdl/gateway/status";
// Retained presence map for the sensor nodes, maintained by the gateway because they have no
// MQTT session of their own: {"ts":...,"N1":"online","N2":"offline"}. Republished on every
// transition and refreshed every kPresencePeriodMs so "ts" stays usable as an age check.
constexpr const char *kTopicSensorStatus = "@msg/sdl/sensor/status";
constexpr uint32_t kPresencePeriodMs = 30000;

}  // namespace cfg
