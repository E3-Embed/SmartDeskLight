// SmartDeskLight — Sensor Node (ESP32 A)
// Reads BH1750 + TCS34725, sends SdlTelemetry to the gateway over ESP-NOW,
// waits for ACK and retries (E4).
#include <Arduino.h>
#include <Wire.h>    // I2C for BH1750 + TCS34725 (own drivers, E8)
#include <WiFi.h>
#include <esp_now.h>
#include "message.h"

static const uint8_t NODE_ID = 1;
static uint8_t GATEWAY_MAC[6] = {0x00, 0x00, 0x00, 0x00, 0x00, 0x00};  // TODO: set gateway MAC

static volatile uint32_t lastAckedSeq = 0;
static uint32_t seq = 0;

// Arduino-ESP32 3.x (ESP-IDF 5) changed the ESP-NOW receive callback signature
#if ESP_ARDUINO_VERSION_MAJOR >= 3
static void onRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
#else
static void onRecv(const uint8_t *mac, const uint8_t *data, int len) {
#endif
  if (len == sizeof(SdlAck)) {
    const SdlAck *ack = (const SdlAck *)data;
    if (ack->type == SDL_MSG_ACK && ack->node_id == NODE_ID) lastAckedSeq = ack->seq;
  }
}

static bool sendWithRetry(const SdlTelemetry &pkt) {
  for (int attempt = 0; attempt <= SDL_MAX_RETRY; attempt++) {
    esp_now_send(GATEWAY_MAC, (const uint8_t *)&pkt, sizeof(pkt));
    uint32_t t0 = millis();
    while (millis() - t0 < SDL_ACK_TIMEOUT_MS) {
      if (lastAckedSeq == pkt.seq) return true;
      delay(1);
    }
  }
  return false;  // TODO: count for packet-delivery-rate metric
}

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_STA);
  if (esp_now_init() != ESP_OK) { Serial.println("ESP-NOW init failed"); ESP.restart(); }
  esp_now_register_recv_cb(onRecv);
  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, GATEWAY_MAC, 6);
  peer.channel = 0;  // must match gateway Wi-Fi channel
  esp_now_add_peer(&peer);
  // TODO: init BH1750 (own driver) and TCS34725
}

void loop() {
  SdlTelemetry pkt = {};
  pkt.version = SDL_PROTO_VERSION;
  pkt.type = SDL_MSG_TELEMETRY;
  pkt.node_id = NODE_ID;
  pkt.seq = ++seq;
  pkt.ts_ms = millis();
  // TODO: pkt.lux = bh1750_read_lux(); read TCS34725 into r,g,b,c,cct
  bool ok = sendWithRetry(pkt);
  Serial.printf("seq=%lu ack=%d\n", (unsigned long)pkt.seq, ok);
  delay(1000);
}
