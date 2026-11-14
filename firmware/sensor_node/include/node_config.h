// SmartDeskLight sensor node — build-time configuration.
// One board, one ID: the gateway keys its node table on this, so give each physical node
// its own value before flashing (simulated nodes use 101+, see gateway config.h).
#pragma once
#include <stdint.h>

namespace nodecfg {

constexpr uint8_t kNodeId = 1;

// Status pixel: the ESP32-S3-DevKitC-1's on-board WS2812, GPIO48 — the same arrangement as
// the gateway. Nothing to wire; change the pin only if you drive an external pixel instead.
constexpr uint8_t kPinStatusLed = 48;
constexpr uint8_t kStatusLedBrightness = 2;  // the on-board pixel is blinding at full power

// I2C for the BH1750 (0x23) and TCS34725 (0x29). On the S3, GPIO 22-25 do not exist and
// 26-32 belong to the in-package flash, so the old 21/22 wiring cannot be used — these
// mirror the gateway's bus pins. Update both if you wire the sensors elsewhere.
constexpr int kPinSda = 8;
constexpr int kPinScl = 9;

// Health heartbeat period. Once the BH1750/TCS34725 drivers land, sensor telemetry runs at
// 1 Hz; the heartbeat stays slower because it only exists to prove the link and report health.
constexpr uint32_t kHeartbeatMs = 2000;

// The gateway follows its access point's channel, which the node cannot know in advance.
// At boot the node broadcasts a probe on each 2.4 GHz channel and keeps the one that answers.
constexpr uint8_t kScanFirstChannel = 1;
constexpr uint8_t kScanLastChannel = 13;
constexpr uint32_t kScanAckTimeoutMs = 60;  // the gateway answers in a few ms; do not linger

// No ACK for this long means the gateway rebooted onto another channel (or moved out of
// range): throw the link away and scan again.
constexpr uint32_t kLinkLostMs = 15000;

// While no gateway has ever answered, retry the scan on this cadence.
constexpr uint32_t kScanRetryMs = 5000;

}  // namespace nodecfg
