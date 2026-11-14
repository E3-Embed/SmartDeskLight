// Shared message format: Sensor Node <-> Gateway over ESP-NOW
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
