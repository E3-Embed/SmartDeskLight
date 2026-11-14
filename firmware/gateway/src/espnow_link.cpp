#include "espnow_link.h"

#include <WiFi.h>
#include <esp_now.h>
#include <string.h>

#include "app.h"

namespace espnow_link {
namespace {

void sendAck(const uint8_t *mac, uint8_t nodeId, uint32_t seq) {
  // The node must be a registered peer before we can reply to it.
  if (!esp_now_is_peer_exist(mac)) {
    esp_now_peer_info_t peer = {};
    memcpy(peer.peer_addr, mac, 6);
    peer.channel = 0;  // current channel
    peer.encrypt = false;
    esp_now_add_peer(&peer);
  }
  SdlAck ack = {SDL_PROTO_VERSION, SDL_MSG_ACK, nodeId, seq};
  esp_now_send(mac, reinterpret_cast<const uint8_t *>(&ack), sizeof(ack));
}

// Runs in the Wi-Fi task context: keep it short. ACK immediately (the node waits at most
// 100 ms), then hand the packet to EspNowRxTask through a queue. The first packet a node
// sends is a broadcast heartbeat on the channel it guessed, so this also answers the
// gateway's address back to the node, which switches to unicast from then on.
#if ESP_ARDUINO_VERSION_MAJOR >= 3
void onRecv(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  const uint8_t *mac = info->src_addr;
#else
void onRecv(const uint8_t *mac, const uint8_t *data, int len) {
#endif
  if (len == static_cast<int>(sizeof(SdlTelemetry))) {
    SdlTelemetry pkt;
    memcpy(&pkt, data, sizeof(pkt));
    if (pkt.version != SDL_PROTO_VERSION || pkt.type != SDL_MSG_TELEMETRY) return;
    sendAck(mac, pkt.node_id, pkt.seq);
    xQueueSend(app::qTelemetry, &pkt, 0);
  } else if (len == static_cast<int>(sizeof(SdlSysStatus))) {
    SdlSysStatus sys;
    memcpy(&sys, data, sizeof(sys));
    if (sys.version != SDL_PROTO_VERSION || sys.type != SDL_MSG_SYS) return;
    sendAck(mac, sys.node_id, sys.seq);
    xQueueSend(app::qNodeSys, &sys, 0);
  }
}

// Caller holds app::StateLock.
app::NodeState *nodeSlot(uint8_t id) {
  for (auto &n : app::state.nodes) {
    if (n.used && n.id == id) return &n;
  }
  for (auto &n : app::state.nodes) {
    if (!n.used) {
      n = app::NodeState{};
      n.used = true;
      n.id = id;
      Serial.printf("[espnow] new node %u\n", id);
      return &n;
    }
  }
  return nullptr;  // table full
}

// Returns true if this packet is new; false if it is a retry we already have.
bool updateNodeTable(const SdlTelemetry &pkt) {
  app::StateLock lock;
  app::NodeState *slot = nodeSlot(pkt.node_id);
  if (!slot) return false;

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

// Heartbeat: record health, but do not touch lastSeenMs — ControlTask must keep treating a
// node without sensor readings as stale instead of closing the loop on a stale/zero lux.
void updateNodeSys(const SdlSysStatus &pkt) {
  app::NodeState copy;
  {
    app::StateLock lock;
    app::NodeState *slot = nodeSlot(pkt.node_id);
    if (!slot) return;
    slot->sysSeen = true;
    slot->lastSysMs = millis();
    slot->uptimeS = pkt.uptime_s;
    slot->freeHeap = pkt.free_heap;
    slot->minFreeHeap = pkt.min_free_heap;
    slot->txAttempts = pkt.tx_attempts;
    slot->txAcked = pkt.tx_acked;
    slot->resetReason = pkt.reset_reason;
    slot->nodeChannel = pkt.channel;
    slot->tempCdeg = pkt.temp_cdeg;
    copy = *slot;
  }
  Serial.printf("[espnow] node %u heartbeat: up=%lus heap=%lu min=%lu ch=%u reset=%u temp=%.1fC tx=%lu/%lu\n",
                copy.id, static_cast<unsigned long>(copy.uptimeS),
                static_cast<unsigned long>(copy.freeHeap / 1024),
                static_cast<unsigned long>(copy.minFreeHeap / 1024),
                static_cast<unsigned>(copy.nodeChannel),
                static_cast<unsigned>(copy.resetReason), copy.tempCdeg / 10.0f,
                static_cast<unsigned long>(copy.txAcked),
                static_cast<unsigned long>(copy.txAttempts));
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
  SdlSysStatus sys;
  for (;;) {
    // Wake on a reading, but poll often enough that a heartbeat is never held up by silence
    // on the telemetry queue.
    if (xQueueReceive(app::qTelemetry, &pkt, pdMS_TO_TICKS(100)) == pdTRUE) {
      if (updateNodeTable(pkt)) {
        app::TelemetryRecord rec{pkt, app::nowEpoch()};
        if (xQueueSend(app::qCloud, &rec, 0) != pdTRUE) {
          Serial.println("[espnow] cloud queue full, reading dropped");
        }
      }
    }
    while (xQueueReceive(app::qNodeSys, &sys, 0) == pdTRUE) {
      updateNodeSys(sys);
      app::NodeSysRecord rec{sys, app::nowEpoch()};
      if (xQueueSend(app::qCloudSys, &rec, 0) != pdTRUE) {
        Serial.println("[espnow] cloud sys queue full, heartbeat dropped");
      }
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
