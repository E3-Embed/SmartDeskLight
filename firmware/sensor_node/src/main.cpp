// SmartDeskLight — Sensor Node (ESP32-S3 DevKitC-1)
//
// Links to the gateway over ESP-NOW and sends two streams on the same ACK/retry path (E4):
//   SDL_MSG_SYS       health heartbeat every kHeartbeatMs — proves the link, reports uptime,
//                     heap, reset reason, channel, SoC temperature and the TX success ratio
//   SDL_MSG_TELEMETRY one reading set every kSensorPeriodMs — lux and RGBC from the I2C
//                     sensors behind the seam in sensors.h
//
// No gateway MAC or channel is configured here. The node broadcasts a probe on channels
// 1..13 until one is answered, learns the gateway MAC from the ACK's source address, then
// talks unicast. That is what lets the link come up when the gateway sits on an access
// point channel the node could not know in advance — and it recovers by itself if the
// gateway later reboots onto another channel.
//
// Timing rules for anything added to loop(): the radio is polled from this task, and every
// send blocks for up to SDL_ACK_TIMEOUT_MS per attempt while it waits for its ACK. Keep any
// new work shorter than nodecfg::kSensorReadBudgetMs; anything slower belongs in its own
// task feeding a queue.
#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_system.h>
#include <esp_wifi.h>
#include <string.h>

#include "message.h"
#include "node_config.h"
#include "sensors.h"
#include "status_led.h"

namespace {

constexpr uint8_t kBroadcastMac[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// The receive callback runs in the Wi-Fi task (not an ISR), so a plain critical section is
// enough to hand an ACK to the main loop without torn reads.
struct AckInfo {
  uint32_t seq = 0;
  uint32_t atMs = 0;
  uint8_t src[6] = {};
};

AckInfo gAck;
portMUX_TYPE gAckMux = portMUX_INITIALIZER_UNLOCKED;

uint32_t gSeq = 0;  // global packet counter: ACKs carry only (node_id, seq), so every packet
                    // of any type gets a unique number. Do not split this per message type.
uint32_t gTxAttempts = 0;
uint32_t gTxAcked = 0;
uint8_t gGatewayMac[6] = {};
uint8_t gLinkChannel = 0;
bool gLinked = false;
uint32_t gLastHeartbeatMs = 0;
uint32_t gLastSensorMs = 0;
uint32_t gSensorMisses = 0;
uint32_t gLastScanMs = 0;
esp_reset_reason_t gResetReason = ESP_RST_UNKNOWN;

#if ESP_ARDUINO_VERSION_MAJOR >= 3
static void onRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  const uint8_t *src = info->src_addr;
#else
static void onRecv(const uint8_t *src, const uint8_t *data, int len) {
#endif
  if (len != static_cast<int>(sizeof(SdlAck))) return;
  SdlAck ack;
  memcpy(&ack, data, sizeof(ack));
  if (ack.version != SDL_PROTO_VERSION || ack.type != SDL_MSG_ACK) return;
  if (ack.node_id != nodecfg::kNodeId) return;

  portENTER_CRITICAL(&gAckMux);
  memcpy(gAck.src, src, sizeof(gAck.src));
  gAck.seq = ack.seq;
  gAck.atMs = millis();
  portEXIT_CRITICAL(&gAckMux);
}

// True if an ACK for `seq` arrived from `expected` (nullptr while the gateway MAC is still
// unknown). Copies it out so the caller can learn the gateway address from the first probe.
static bool takeAck(uint32_t seq, const uint8_t *expected, AckInfo *out) {
  portENTER_CRITICAL(&gAckMux);
  const bool match = gAck.seq == seq && (!expected || memcmp(gAck.src, expected, 6) == 0);
  if (match && out) *out = gAck;
  portEXIT_CRITICAL(&gAckMux);
  return match;
}

static uint32_t ackAgeMs(uint32_t now) {
  portENTER_CRITICAL(&gAckMux);
  const uint32_t at = gAck.atMs;
  portEXIT_CRITICAL(&gAckMux);
  return now - at;
}

// A peer is bound to a channel at add time, so re-add it after every channel change.
static bool setPeer(const uint8_t *mac, uint8_t channel) {
  esp_now_del_peer(mac);  // ESP_ERR_ESPNOW_NOT_FOUND until the first add; nothing to do
  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, mac, 6);
  peer.channel = channel;
  peer.encrypt = false;
  const esp_err_t err = esp_now_add_peer(&peer);
  if (err != ESP_OK) Serial.printf("[link] add_peer failed: %s\n", esp_err_to_name(err));
  return err == ESP_OK;
}

static SdlSysStatus buildHeartbeat(uint32_t seq) {
  SdlSysStatus p = {};
  p.version = SDL_PROTO_VERSION;
  p.type = SDL_MSG_SYS;
  p.node_id = nodecfg::kNodeId;
  p.seq = seq;
  p.ts_ms = millis();
  p.uptime_s = millis() / 1000;
  p.free_heap = ESP.getFreeHeap();
  p.min_free_heap = ESP.getMinFreeHeap();
  p.tx_attempts = gTxAttempts;  // counters up to the previous packet; this one is counted below
  p.tx_acked = gTxAcked;
  p.reset_reason = static_cast<uint8_t>(gResetReason);
  p.channel = gLinkChannel;
  // Internal sensor: absolute values are offset and vary per chip, but the trend tracks the
  // die temperature, which is what tells you the node is cooking in a closed enclosure.
  p.temp_cdeg = static_cast<int16_t>(lroundf(temperatureRead() * 10.0f));
  return p;
}

static SdlTelemetry buildTelemetry(uint32_t seq, const SensorSample &s) {
  SdlTelemetry p = {};
  p.version = SDL_PROTO_VERSION;
  p.type = SDL_MSG_TELEMETRY;
  p.node_id = nodecfg::kNodeId;
  p.seq = seq;
  p.ts_ms = millis();
  p.lux = s.lux;
  p.r = s.r;
  p.g = s.g;
  p.b = s.b;
  p.c = s.c;
  p.cct = s.cct;
  return p;
}

static bool sendAndWait(const uint8_t *dst, const void *pkt, size_t len, uint32_t seq,
                        int attempts, uint32_t timeoutMs, const uint8_t *expectSrc,
                        AckInfo *outAck = nullptr) {
  for (int i = 0; i < attempts; ++i) {
    const esp_err_t err = esp_now_send(dst, static_cast<const uint8_t *>(pkt), len);
    if (err != ESP_OK) {  // peer missing / radio busy — no point retrying the same way
      Serial.printf("[link] send failed: %s\n", esp_err_to_name(err));
      return false;
    }
    gTxAttempts++;
    const uint32_t t0 = millis();
    while (millis() - t0 < timeoutMs) {
      if (takeAck(seq, expectSrc, outAck)) {
        gTxAcked++;
        return true;  // a retry that is answered late still counts as delivered
      }
      delay(1);
    }
  }
  return false;  // TODO: count for the packet-delivery-rate metric (tests/README.md)
}

// Broadcast the heartbeat on each channel until the gateway answers. The ACK identifies the
// gateway's MAC (needed for unicast) and the channel the ACK came in on.
static bool linkUp() {
  status_led::setLinkState(status_led::LinkState::Scanning);
  Serial.println("[link] scanning channels for the gateway");
  for (uint8_t ch = nodecfg::kScanFirstChannel; ch <= nodecfg::kScanLastChannel; ++ch) {
    if (esp_wifi_set_channel(ch, WIFI_SECOND_CHAN_NONE) != ESP_OK) continue;
    if (!setPeer(kBroadcastMac, ch)) continue;

    AckInfo ack;
    SdlSysStatus probe = buildHeartbeat(++gSeq);
    probe.channel = ch;
    if (!sendAndWait(kBroadcastMac, &probe, sizeof(probe), probe.seq, 1,
                     nodecfg::kScanAckTimeoutMs, nullptr, &ack)) {
      continue;
    }

    memcpy(gGatewayMac, ack.src, sizeof(gGatewayMac));
    gLinkChannel = ch;
    esp_now_del_peer(kBroadcastMac);
    if (!setPeer(gGatewayMac, ch)) {
      status_led::setLinkState(status_led::LinkState::NoGateway);
      return false;
    }
    gLinked = true;
    status_led::setLinkState(status_led::LinkState::Linked);
    Serial.printf("[link] gateway %02X:%02X:%02X:%02X:%02X:%02X on channel %u\n",
                  gGatewayMac[0], gGatewayMac[1], gGatewayMac[2], gGatewayMac[3],
                  gGatewayMac[4], gGatewayMac[5], ch);
    return true;
  }
  Serial.println("[link] no gateway answered");
  status_led::setLinkState(status_led::LinkState::NoGateway);
  return false;
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(200);
  gResetReason = esp_reset_reason();

  status_led::begin();
  xTaskCreatePinnedToCore(status_led::task, "led", 3072, nullptr, 1, nullptr, 1);

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);  // the ACK window is 100 ms; do not let the radio nap through it
  Serial.printf("\nSmartDeskLight sensor node %u, MAC %s, reset %d\n", nodecfg::kNodeId,
                WiFi.macAddress().c_str(), static_cast<int>(gResetReason));

  if (esp_now_init() != ESP_OK) {
    Serial.println("[link] ESP-NOW init failed, restarting");
    status_led::setLinkState(status_led::LinkState::NoGateway);  // red, visible before the reset
    delay(2000);
    ESP.restart();
  }
  esp_now_register_recv_cb(onRecv);

  gLastScanMs = millis();
  sensors::begin();  // bus + probe; the drivers themselves are still TODO in sensors.cpp
  linkUp();
}

void loop() {
  const uint32_t now = millis();

  if (!gLinked) {
    if (now - gLastScanMs >= nodecfg::kScanRetryMs) {
      gLastScanMs = now;
      linkUp();
    }
    delay(50);
    return;
  }

  if (ackAgeMs(now) > nodecfg::kLinkLostMs) {
    Serial.println("[link] gateway silent, scanning again");
    gLinked = false;
    gLastScanMs = now;
    status_led::setLinkState(status_led::LinkState::NoGateway);
    return;
  }

  // ---- readings, on their own cadence. Only sent when the sensor actually answered: a
  // zero lux that reaches the gateway reads as a dark room and drives the lamp to full
  // power, so a failed read is skipped (and reported) rather than padded with zeros.
  if (now - gLastSensorMs >= nodecfg::kSensorPeriodMs) {
    gLastSensorMs = now;
    SensorSample s;
    if (sensors::lightSensorPresent() && sensors::read(s) && s.bh1750Ok) {
      gSensorMisses = 0;
      SdlTelemetry pkt = buildTelemetry(++gSeq, s);
      if (!sendAndWait(gGatewayMac, &pkt, sizeof(pkt), pkt.seq, 1 + SDL_MAX_RETRY,
                       SDL_ACK_TIMEOUT_MS, gGatewayMac)) {
        Serial.printf("[sensor] telemetry seq=%lu not acked\n",
                      static_cast<unsigned long>(pkt.seq));
      }
    } else if (++gSensorMisses % 30 == 1) {
      Serial.printf("[sensor] no reading (%lu in a row)\n",
                    static_cast<unsigned long>(gSensorMisses));
    }
  }

  // ---- heartbeat, on its own cadence. It owns the link LED: readings may fail without
  // making the link itself look broken.
  if (now - gLastHeartbeatMs >= nodecfg::kHeartbeatMs) {
    gLastHeartbeatMs = now;
    SdlSysStatus pkt = buildHeartbeat(++gSeq);
    const bool acked = sendAndWait(gGatewayMac, &pkt, sizeof(pkt), pkt.seq, 1 + SDL_MAX_RETRY,
                                   SDL_ACK_TIMEOUT_MS, gGatewayMac);
    status_led::setLinkState(acked ? status_led::LinkState::Linked
                                   : status_led::LinkState::Retrying);
    Serial.printf("[node] seq=%lu ch=%u ack=%d up=%lus heap=%lu min=%lu reset=%u tx=%lu/%lu\n",
                  static_cast<unsigned long>(pkt.seq), gLinkChannel, acked ? 1 : 0,
                  static_cast<unsigned long>(pkt.uptime_s),
                  static_cast<unsigned long>(pkt.free_heap),
                  static_cast<unsigned long>(pkt.min_free_heap),
                  static_cast<unsigned>(pkt.reset_reason),
                  static_cast<unsigned long>(gTxAttempts),
                  static_cast<unsigned long>(gTxAcked));
  }

  delay(5);
}
