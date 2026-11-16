// Shared message format: Sensor Node <-> Gateway over ESP-NOW
//
// Both firmwares include this file, so any change here is a wire-format change: bump
// SDL_PROTO_VERSION and reflash node and gateway together. The gateway also learns a packet's
// type from its header, and falls back on the length — the static_asserts at the bottom keep
// the three sizes distinct so a length check can never confuse two message types.
#pragma once
#include <stdint.h>

#define SDL_PROTO_VERSION 1
#define SDL_MAX_RETRY     3
#define SDL_ACK_TIMEOUT_MS 100

enum SdlMsgType : uint8_t {
  SDL_MSG_TELEMETRY = 1,
  SDL_MSG_ACK       = 2,
  SDL_MSG_SYS       = 3,  // node health heartbeat, no sensor data required
};

// Node -> Gateway
typedef struct __attribute__((packed)) {
  uint8_t  version;     // SDL_PROTO_VERSION
  uint8_t  type;        // SDL_MSG_TELEMETRY
  uint8_t  node_id;     // 1, 2, ... (simulated nodes use 101+)
  uint32_t seq;         // increments per packet, used for ACK/dup detection
  uint32_t ts_ms;       // millis() on the node
  float    lux;         // BH1750
  uint16_t r, g, b, c;  // TCS34725 raw channels
  uint16_t cct;         // estimated colour temperature (K)
} SdlTelemetry;

// Gateway -> Node
typedef struct __attribute__((packed)) {
  uint8_t  version;
  uint8_t  type;        // SDL_MSG_ACK
  uint8_t  node_id;
  uint32_t seq;         // seq being acknowledged
} SdlAck;

// Node -> Gateway: health heartbeat. Needs no sensor, so the link can be brought up and
// exercised before the BH1750/TCS34725 drivers exist. Same ACK/retry path as telemetry.
//
// The node also uses this packet as its channel probe: it is broadcast on every 2.4 GHz
// channel until the gateway answers, which is how the link finds the access point's
// channel without hard-coding it.
typedef struct __attribute__((packed)) {
  uint8_t  version;
  uint8_t  type;           // SDL_MSG_SYS
  uint8_t  node_id;
  uint32_t seq;
  uint32_t ts_ms;          // millis() on the node
  uint32_t uptime_s;
  uint32_t free_heap;      // bytes
  uint32_t min_free_heap;  // bytes, low-water mark since boot
  uint32_t tx_attempts;    // ESP-NOW sends, retries included
  uint32_t tx_acked;       // sends that got an ACK
  uint8_t  reset_reason;   // esp_reset_reason_t on the node
  uint8_t  channel;        // Wi-Fi channel the node is using
  int16_t  temp_cdeg;      // SoC temperature in 0.1 C (internal sensor; coarse, relative only)
} SdlSysStatus;

// Wire sizes, checked at compile time on both firmwares. If one of these fires, you changed a
// packet: bump SDL_PROTO_VERSION and update the matching static_assert — do not just relax it,
// because an older peer will otherwise parse your fields into the wrong places.
static_assert(sizeof(SdlTelemetry) == 25, "SdlTelemetry wire size changed");
static_assert(sizeof(SdlSysStatus) == 35, "SdlSysStatus wire size changed");
static_assert(sizeof(SdlAck) == 7, "SdlAck wire size changed");
// The gateway dispatches on the header's type byte and validates the length; these guard the
// case where a future field makes two message types the same size and a length check becomes
// ambiguous.
static_assert(sizeof(SdlTelemetry) != sizeof(SdlSysStatus), "message types must differ in size");
static_assert(sizeof(SdlTelemetry) != sizeof(SdlAck), "message types must differ in size");
static_assert(sizeof(SdlSysStatus) != sizeof(SdlAck), "message types must differ in size");
