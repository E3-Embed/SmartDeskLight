// Shared message format: Sensor Node <-> Gateway over ESP-NOW
#pragma once
#include <stdint.h>

#define SDL_PROTO_VERSION 1
#define SDL_MAX_RETRY     3
#define SDL_ACK_TIMEOUT_MS 100

enum SdlMsgType : uint8_t {
  SDL_MSG_TELEMETRY = 1,
  SDL_MSG_ACK       = 2,
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
