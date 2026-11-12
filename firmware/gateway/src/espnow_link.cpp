#include "espnow_link.h"

#include <WiFi.h>
#include <esp_now.h>
#include <string.h>

#include "app.h"

namespace espnow_link {
namespace {

void sendAck(const uint8_t *mac, const SdlTelemetry &pkt) {
  // The node must be a registered peer before we can reply to it.
  if (!esp_now_is_peer_exist(mac)) {
    esp_now_peer_info_t peer = {};
    memcpy(peer.peer_addr, mac, 6);
    peer.channel = 0;  // current channel
    peer.encrypt = false;
    esp_now_add_peer(&peer);
  }
  SdlAck ack = {SDL_PROTO_VERSION, SDL_MSG_ACK, pkt.node_id, pkt.seq};
  esp_now_send(mac, reinterpret_cast<const uint8_t *>(&ack), sizeof(ack));
}

// Runs in the Wi-Fi task context: keep it short. ACK immediately (the node waits at most
// 100 ms), then hand the packet to EspNowRxTask through a queue.
#if ESP_ARDUINO_VERSION_MAJOR >= 3
void onRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  const uint8_t *mac = info->src_addr;
#else
void onRecv(const uint8_t *mac, const uint8_t *data, int len) {
#endif
  if (len != sizeof(SdlTelemetry)) return;
  SdlTelemetry pkt;
  memcpy(&pkt, data, sizeof(pkt));
  if (pkt.version != SDL_PROTO_VERSION || pkt.type != SDL_MSG_TELEMETRY) return;
  sendAck(mac, pkt);
  xQueueSend(app::qTelemetry, &pkt, 0);
}

// Returns true if this packet is new; false if it is a retry we already have.
bool updateNodeTable(const SdlTelemetry &pkt) {
  app::StateLock lock;
  app::NodeState *slot = nullptr;
  for (auto &n : app::state.nodes) {
    if (n.used && n.id == pkt.node_id) { slot = &n; break; }
  }
  if (!slot) {
    for (auto &n : app::state.nodes) {
      if (!n.used) {
        n = app::NodeState{};
        n.used = true;
        n.id = pkt.node_id;
        slot = &n;
        Serial.printf("[espnow] new node %u\n", pkt.node_id);
        break;
      }
    }
  }
  if (!slot) return false;  // table full

  // A node that rebooted starts again at seq 1, so only treat equal seq as a duplicate.
  if (slot->received > 0 && pkt.seq == slot->lastSeq) {
    slot->duplicates++;
    return false;
  }
  slot->lastSeq = pkt.seq;
  slot->lastSeenMs = millis();
  slot->received++;
  slot->lux = pkt.lux;
  slot->cct = pkt.cct;
  slot->lostAlerted = false;
  return true;
}

}  // namespace

bool begin() {
  if (esp_now_init() != ESP_OK) return false;
  esp_now_register_recv_cb(onRecv);
  Serial.printf("[espnow] ready, MAC %s, channel %d\n", WiFi.macAddress().c_str(), WiFi.channel());
  return true;
}

void rxTask(void *) {
  SdlTelemetry pkt;
  for (;;) {
    if (xQueueReceive(app::qTelemetry, &pkt, portMAX_DELAY) != pdTRUE) continue;
    if (!updateNodeTable(pkt)) continue;
    app::TelemetryRecord rec{pkt, app::nowEpoch()};
    if (xQueueSend(app::qCloud, &rec, 0) != pdTRUE) {
      Serial.println("[espnow] cloud queue full, reading dropped");
    }
  }
}

void simulatorTask(void *) {
  uint32_t seq = 0;
  for (;;) {
    seq++;
    for (int i = 0; i < cfg::kSimulatedNodes; i++) {
      SdlTelemetry pkt = {};
      pkt.version = SDL_PROTO_VERSION;
      pkt.type = SDL_MSG_TELEMETRY;
      pkt.node_id = cfg::kFirstSimulatedId + i;
      pkt.seq = seq;
      pkt.ts_ms = millis();
      pkt.lux = 300.0f + 40.0f * i + random(-15, 15);
      pkt.cct = 4000 + 100 * i;
      xQueueSend(app::qTelemetry, &pkt, 0);
    }
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}

}  // namespace espnow_link
