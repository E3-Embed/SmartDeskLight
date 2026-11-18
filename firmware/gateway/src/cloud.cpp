#include "cloud.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <esp_system.h>
#include <string.h>
#include <time.h>

#include "ai_client.h"
#include "app.h"
#include "ca_bundle.h"
#include "ring_buffer.h"
#include "secrets.h"

namespace cloud {
namespace {

WiFiClientSecure tls;
PubSubClient mqtt(tls);
RingBuffer<app::TelemetryRecord, cfg::kBufferSlots> backlog;  // readings waiting for the cloud

uint32_t lastWifiTryMs = 0;
uint32_t lastMqttTryMs = 0;
uint32_t lastStateMs = 0;
uint32_t lastGwTelemetryMs = 0;
uint32_t lastPresenceMs = 0;
uint32_t lastPresenceSig = 0;
uint32_t lastAiMs = 0;
uint32_t lastNtpRetryMs = 0;
bool timeConfigured = false;
bool wasOnline = false;
uint32_t offlineSinceMs = 0;
bool gwTelemetryDue = true;  // publish gateway health as soon as MQTT comes up
bool presenceDue = true;     // republish node presence (retained) on every connect
uint32_t wifiRetries = 0;    // WiFi.reconnect() calls
uint32_t mqttFails = 0;      // TLS or MQTT connect attempts that failed

// ---------------------------------------------------------------- dashboard commands
// Payloads on @msg/sdl/cmd:  {"mode":"coding"}  or  {"feedback":"too_bright"|"too_dim"}
void onMqttMessage(char *topic, byte *payload, unsigned int length) {
  JsonDocument doc;
  if (deserializeJson(doc, reinterpret_cast<const char *>(payload), length)) return;

  app::ControlEvent ev{};
  const char *mode = doc["mode"];
  if (mode && app::modeFromString(mode, ev.mode)) {
    ev.type = app::EventType::SetMode;
    xQueueSend(app::qControl, &ev, 0);
  }
  const char *fb = doc["feedback"];
  if (fb) {
    ev.type = app::EventType::Feedback;
    ev.feedback = !strcmp(fb, "too_bright") ? 1 : (!strcmp(fb, "too_dim") ? -1 : 0);
    if (ev.feedback != 0) xQueueSend(app::qControl, &ev, 0);
  }
}

// ---------------------------------------------------------------- connections
// Every TLS endpoint (EMQX 8883, Google, Discord) is verified against the built-in
// CA bundle, and chain verification compares the certificate's validity dates with
// the system clock. Until NTP has set that clock, every handshake fails with
// "certificate is not yet valid", so nothing may connect before the time is real.
bool timeValid() { return app::nowEpoch() != 0; }  // same threshold the rest of the app uses

bool ensureTime() {
  if (timeValid()) return true;
  if (!timeConfigured) {
    configTime(cfg::kUtcOffsetSec, 0, cfg::kNtpServer1, cfg::kNtpServer2, cfg::kNtpServer3);
    timeConfigured = true;
    lastNtpRetryMs = millis();
    Serial.printf("[cloud] waiting for NTP (%s) before TLS...\n", cfg::kNtpServer1);
  } else if (millis() - lastNtpRetryMs > 60000) {
    // SNTP never landed (blocked UDP/123, dead DNS): arm it again instead of failing forever.
    configTime(cfg::kUtcOffsetSec, 0, cfg::kNtpServer1, cfg::kNtpServer2, cfg::kNtpServer3);
    lastNtpRetryMs = millis();
    Serial.println("[cloud] NTP still not synced, re-arming");
  }
  return false;
}

bool ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    xEventGroupSetBits(app::events, app::kBitWifiUp);
    return true;
  }
  xEventGroupClearBits(app::events, app::kBitWifiUp | app::kBitMqttUp);
  if (millis() - lastWifiTryMs > 10000) {
    lastWifiTryMs = millis();
    Serial.println("[cloud] Wi-Fi reconnecting...");
    wifiRetries++;
    WiFi.reconnect();
  }
  return false;
}

bool ensureMqtt() {
  if (mqtt.connected()) return true;
  xEventGroupClearBits(app::events, app::kBitMqttUp);
  if (millis() - lastMqttTryMs < 5000) return false;
  lastMqttTryMs = millis();

  // E5: the broker is authenticated by the CA bundle chain check. The TLS session is
  // opened before any credential is sent, so the token never reaches an unverified peer.
  if (!tls.connected()) {
    if (!tls.connect(cfg::kMqttHost, cfg::kMqttPort)) {
      mqttFails++;
      Serial.printf("[cloud] TLS connect to the broker failed (clock=%lld)\n",
                    static_cast<long long>(time(nullptr)));
      return false;
    }
  }

  // EMQX: client id = cfg::kDeviceName, username/password come from secrets.h (the macros
  // keep their NETPIE names). Two sessions with the same client id kick each other off.
  // The Last Will is retained: when the gateway disappears without a clean DISCONNECT
  // (power cut, crash, radio gone past the 30 s keepalive), EMQX publishes "offline"
  // for us and every subscriber sees it.
  if (!mqtt.connect(cfg::kDeviceName, NETPIE_TOKEN, NETPIE_SECRET, cfg::kTopicStatus, 1, true,
                    "offline")) {
    mqttFails++;
    Serial.printf("[cloud] MQTTS connect failed, state %d\n", mqtt.state());
    return false;
  }
  // Retained too, so replacing the will's value is atomic from a subscriber's view.
  if (!mqtt.publish(cfg::kTopicStatus, "online", true)) {
    Serial.println("[cloud] status publish failed");
  }
  mqtt.subscribe(cfg::kTopicCmd);
  xEventGroupSetBits(app::events, app::kBitMqttUp);
  gwTelemetryDue = true;  // report the fresh link immediately, then on the normal cadence
  presenceDue = true;     // the retained presence map must reflect this session, not the last
  Serial.printf("[cloud] MQTTS connected to %s\n", cfg::kMqttHost);
  return true;
}

// ---------------------------------------------------------------- publishing
bool publishReading(const app::TelemetryRecord &rec) {
  JsonDocument doc;
  char nodeName[8];
  snprintf(nodeName, sizeof(nodeName), "N%u", rec.pkt.node_id);
  doc["node_id"] = nodeName;
  doc["seq"] = rec.pkt.seq;
  if (rec.epoch) doc["ts"] = rec.epoch;  // wall clock when the gateway received it
  doc["node_ms"] = rec.pkt.ts_ms;
  doc["lux"] = rec.pkt.lux;
  doc["r"] = rec.pkt.r;
  doc["g"] = rec.pkt.g;
  doc["b"] = rec.pkt.b;
  doc["c"] = rec.pkt.c;
  doc["cct"] = rec.pkt.cct;

  char payload[256];
  size_t n = serializeJson(doc, payload, sizeof(payload));
  // One sensor topic for every node; node_id in the payload separates them, so a dashboard
  // subscribes once instead of once per node.
  return mqtt.publish(cfg::kTopicSensorTelemetry, reinterpret_cast<const uint8_t *>(payload), n);
}

// Full snapshot for dashboards, every kStatePeriodMs: what the lamp is doing plus the last
// value seen from every node. Flat JSON — this used to be a NETPIE shadow document, but on a
// self-hosted broker there is no shadow store to wrap it in.
void publishState() {
  JsonDocument doc;
  JsonObject d = doc.to<JsonObject>();
  d["device"] = cfg::kDeviceName;
  {
    app::StateLock lock;
    const auto &s = app::state;
    uint32_t now = millis();
    for (const auto &n : s.nodes) {
      if (!n.used) continue;
      char key[24];
      snprintf(key, sizeof(key), "n%u_lux", n.id);   d[key] = n.lux;
      snprintf(key, sizeof(key), "n%u_cct", n.id);   d[key] = n.cct;
      if (n.received > 0) {  // telemetry age only makes sense once telemetry has arrived
        snprintf(key, sizeof(key), "n%u_age_s", n.id); d[key] = (now - n.lastSeenMs) / 1000;
        snprintf(key, sizeof(key), "n%u_rx", n.id);    d[key] = n.received;
        snprintf(key, sizeof(key), "n%u_seq", n.id);   d[key] = n.lastSeq;
      }
      if (n.sysSeen) {  // health heartbeat from the node itself
        snprintf(key, sizeof(key), "n%u_up_s", n.id);      d[key] = n.uptimeS;
        snprintf(key, sizeof(key), "n%u_heap", n.id);      d[key] = n.freeHeap;
        snprintf(key, sizeof(key), "n%u_temp_c", n.id);    d[key] = n.tempCdeg / 10.0f;
        snprintf(key, sizeof(key), "n%u_sys_age_s", n.id); d[key] = (now - n.lastSysMs) / 1000;
      }
    }
    d["dist_mm"] = s.local.distOk ? s.local.distMm : 0;
    d["presence"] = s.local.presence ? 1 : 0;
    d["lamp_mW"] = s.local.powerMw;
    d["bus_V"] = s.local.busV;
    d["current_mA"] = s.local.currentMa;
    d["diffuser"] = s.lamp.filters[0] ? 1 : 0;
    d["nd"] = s.lamp.filters[1] ? 1 : 0;
    d["warm"] = s.lamp.filters[2] ? 1 : 0;
    d["pwm"] = s.lamp.pwm;
    d["safe"] = s.lamp.safe ? 1 : 0;
    d["mode"] = app::modeName(s.mode);
    d["target_lux"] = s.profile.targetLux;
    d["target_cct"] = s.profile.targetCct;
    d["ai"] = s.profile.fromAi ? 1 : 0;
  }
  d["buffered"] = backlog.size();
  d["dropped"] = backlog.dropped();
  d["heap"] = ESP.getFreeHeap();
  d["uptime_s"] = millis() / 1000;

  char payload[2048];  // kMaxNodes entries with health keys; must stay <= mqtt buffer size
  size_t n = serializeJson(doc, payload, sizeof(payload));
  mqtt.publish(cfg::kTopicState, reinterpret_cast<const uint8_t *>(payload), n);
}

// Which kind of reset brought the firmware back — the first thing to look at after a mystery reboot.
const char *resetReasonName(esp_reset_reason_t r) {
  switch (r) {
    case ESP_RST_POWERON: return "poweron";
    case ESP_RST_EXT: return "external";
    case ESP_RST_SW: return "software";
    case ESP_RST_PANIC: return "panic";
    case ESP_RST_INT_WDT: return "int_wdt";
    case ESP_RST_TASK_WDT: return "task_wdt";
    case ESP_RST_WDT: return "wdt";
    case ESP_RST_DEEPSLEEP: return "deepsleep";
    case ESP_RST_BROWNOUT: return "brownout";
    case ESP_RST_SDIO: return "sdio";
    default: return "unknown";
  }
}

// Gateway health on its own topic, every kGwTelemetryPeriodMs. Keys stay flat so a dashboard
// or a log pipeline can pick them up without nesting. "uptime_s" resetting to a small number
// is how a dashboard spots a reboot; "reset" says why.
void publishGatewayTelemetry() {
  JsonDocument doc;
  doc["device"] = cfg::kDeviceName;
  doc["uptime_s"] = millis() / 1000;
  doc["wifi_up"] = WiFi.status() == WL_CONNECTED ? 1 : 0;
  doc["wifi_code"] = static_cast<int>(WiFi.status());  // WL_* enum, for the status table
  doc["rssi"] = WiFi.RSSI();
  doc["wifi_ch"] = WiFi.channel();
  doc["ip"] = WiFi.localIP().toString();
  doc["wifi_retries"] = wifiRetries;
  doc["mqtt_fails"] = mqttFails;
  doc["ntp"] = timeValid() ? 1 : 0;
  doc["time"] = app::nowEpoch();
  doc["heap"] = ESP.getFreeHeap();
  doc["heap_min"] = ESP.getMinFreeHeap();
  doc["temp_c"] = temperatureRead();
  doc["reset"] = resetReasonName(esp_reset_reason());
  {
    app::StateLock lock;
    int nodes = 0;
    for (const auto &n : app::state.nodes) {
      if (n.used) nodes++;
    }
    doc["nodes"] = nodes;
    doc["mode"] = app::modeName(app::state.mode);
    doc["safe"] = app::state.lamp.safe ? 1 : 0;
    doc["pwm"] = app::state.lamp.pwm;
  }
  doc["buffered"] = backlog.size();
  doc["dropped"] = backlog.dropped();

  char payload[512];
  size_t n = serializeJson(doc, payload, sizeof(payload));
  if (!mqtt.publish(cfg::kTopicGwTelemetry, reinterpret_cast<const uint8_t *>(payload), n)) {
    Serial.println("[cloud] gateway telemetry publish failed");
  }
}

// Sensor-node health, republished for the node that has no Wi-Fi stack of its own. Health
// keys only: lux/cct appear here once the BH1750/TCS34725 drivers start sending telemetry,
// so a zero never gets mistaken for a dark room.
void publishNodeTelemetry(const app::NodeSysRecord &rec) {
  JsonDocument doc;
  char nodeName[8];
  snprintf(nodeName, sizeof(nodeName), "N%u", rec.pkt.node_id);
  doc["node_id"] = nodeName;
  doc["seq"] = rec.pkt.seq;
  if (rec.epoch) doc["ts"] = rec.epoch;  // wall clock when the gateway received it
  doc["node_ms"] = rec.pkt.ts_ms;
  doc["uptime_s"] = rec.pkt.uptime_s;
  doc["heap"] = rec.pkt.free_heap;
  doc["heap_min"] = rec.pkt.min_free_heap;
  doc["wifi_ch"] = rec.pkt.channel;
  doc["reset"] = resetReasonName(static_cast<esp_reset_reason_t>(rec.pkt.reset_reason));
  doc["temp_c"] = rec.pkt.temp_cdeg / 10.0f;
  doc["tx_acked"] = rec.pkt.tx_acked;
  doc["tx_attempts"] = rec.pkt.tx_attempts;

  char payload[320];
  size_t n = serializeJson(doc, payload, sizeof(payload));
  if (!mqtt.publish(cfg::kTopicSensorTelemetry, reinterpret_cast<const uint8_t *>(payload), n)) {
    Serial.println("[cloud] node telemetry publish failed");
  }
}

// Sensor presence, inferred from ESP-NOW traffic because the nodes have no MQTT session of
// their own. A node is online while heartbeats or readings keep arriving; the thresholds are
// the same ones the status LED uses, so the light and the broker never disagree.
bool nodeOnline(const app::NodeState &n, uint32_t now) {
  return (n.sysSeen && now - n.lastSysMs < cfg::kNodeStaleMs) ||
         (n.received > 0 && now - n.lastSeenMs < cfg::kNodeStaleMs);
}

// One bit per table slot for "known", one bit per slot at +16 for "online". Slots are stable
// for the lifetime of a boot, so comparing signatures catches every transition.
static_assert(cfg::kMaxNodes <= 16, "presence signature packs two bitsets into 32 bits");

uint32_t presenceSignature() {
  app::StateLock lock;
  const uint32_t now = millis();
  uint32_t sig = 0;
  int slot = 0;
  for (const auto &n : app::state.nodes) {
    if (n.used) {
      sig |= 1UL << slot;
      if (nodeOnline(n, now)) sig |= 1UL << (slot + 16);
    }
    ++slot;
  }
  return sig;
}

// Retained, so a dashboard that subscribes later still sees who is online right away.
void publishSensorStatus() {
  JsonDocument doc;
  doc["ts"] = app::nowEpoch();  // 0 until NTP; lets consumers age the map after a gateway outage
  {
    app::StateLock lock;
    const uint32_t now = millis();
    for (const auto &n : app::state.nodes) {
      if (!n.used) continue;
      char key[8];
      snprintf(key, sizeof(key), "N%u", n.id);
      doc[key] = nodeOnline(n, now) ? "online" : "offline";
    }
  }
  char payload[256];
  const size_t len = serializeJson(doc, payload, sizeof(payload));
  if (!mqtt.publish(cfg::kTopicSensorStatus, reinterpret_cast<const uint8_t *>(payload), len,
                    true)) {
    Serial.println("[cloud] sensor status publish failed");
  }
}

// Sends what is waiting, oldest first. Stops at the first failure so order is kept.
void flushBacklog(int maxItems) {
  app::TelemetryRecord rec;
  while (maxItems-- > 0 && backlog.peek(rec)) {
    if (!publishReading(rec)) return;
    backlog.pop();
  }
}

// ---------------------------------------------------------------- alerts
void sendDiscord(const char *text) {
  if (strlen(DISCORD_WEBHOOK) == 0) return;
  WiFiClientSecure client;
#if defined(ALLOW_INSECURE_TLS)
  client.setInsecure();  // development only: build with -DALLOW_INSECURE_TLS
#else
  ca::useBuiltin(client);  // Discord's chain is publicly trusted
#endif

  HTTPClient http;
  if (!http.begin(client, DISCORD_WEBHOOK)) return;
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  JsonDocument doc;
  doc["content"] = String("**SmartDeskLight** · ") + text;
  String body;
  serializeJson(doc, body);
  int code = http.POST(body);
  http.end();
  if (code != 204 && code != 200) Serial.printf("[cloud] Discord HTTP %d\n", code);
}

void handleAlerts(bool httpUp, bool mqttUp) {
  app::Alert a;
  while (xQueueReceive(app::qAlerts, &a, 0) == pdTRUE) {
    if (mqttUp) mqtt.publish(cfg::kTopicAlert, a.text);
    if (httpUp) sendDiscord(a.text);
  }
}

// ---------------------------------------------------------------- AI
void maybeRunAi(bool online) {
  bool requested = xEventGroupGetBits(app::events) & app::kBitAiRequest;
  bool periodic = millis() - lastAiMs > cfg::kAiPeriodMs;
  if (!online || !(requested || periodic)) return;
  xEventGroupClearBits(app::events, app::kBitAiRequest);
  lastAiMs = millis();

  ai::Context ctx{};
  {
    app::StateLock lock;
    const auto &s = app::state;
    for (const auto &n : s.nodes) {
      if (n.used && n.id == cfg::kPrimaryNodeId) {
        ctx.lux = n.lux;
        ctx.cct = n.cct;
      }
    }
    ctx.distMm = s.local.distMm;
    ctx.presence = s.local.presence;
    ctx.mode = s.mode;
    for (int i = 0; i < 3; i++) ctx.filters[i] = s.lamp.filters[i];
    ctx.pwm = s.lamp.pwm;
    memcpy(ctx.feedback, s.feedback, sizeof(ctx.feedback));
    ctx.feedbackCount = s.feedbackCount;
  }
  time_t t = time(nullptr);
  struct tm local;
  localtime_r(&t, &local);
  ctx.hour = app::nowEpoch() ? local.tm_hour : 12;

  app::ControlEvent ev{};
  if (ai::requestProfile(ctx, ev.profile)) {
    ev.type = app::EventType::NewProfile;
    xQueueSend(app::qControl, &ev, pdMS_TO_TICKS(100));
  } else {
    Serial.println("[ai] unavailable, keeping rule-based profile");
  }
}

void updateOnlineState(bool online) {
  if (online == wasOnline) return;
  if (online) {
    uint32_t downS = offlineSinceMs ? (millis() - offlineSinceMs) / 1000 : 0;
    if (offlineSinceMs) {
      app::raiseAlert("Cloud link restored after %u s, sending %u buffered readings",
                      static_cast<unsigned>(downS), static_cast<unsigned>(backlog.size()));
    }
  } else {
    offlineSinceMs = millis();
    Serial.println("[cloud] offline: buffering readings");
  }
  wasOnline = online;
  app::StateLock lock;
  app::state.cloudUp = online;
}

}  // namespace

void task(void *) {
  // E5: verify every endpoint against the CA bundle embedded in the firmware.
  // The EMQX certificate is issued by NPMplus/ACME; Google /
  // Discord use public roots too, so no PEM and no leaf fingerprint are needed.
#if defined(ALLOW_INSECURE_TLS)
  tls.setInsecure();
  Serial.println("[cloud] WARNING: ALLOW_INSECURE_TLS set, MQTT TLS without certificate check");
#else
  ca::useBuiltin(tls);
#endif
  tls.setHandshakeTimeout(10);
  mqtt.setServer(cfg::kMqttHost, cfg::kMqttPort);
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(3072);  // must exceed the largest payload (the gw/state snapshot) plus header
  mqtt.setKeepAlive(cfg::kMqttKeepAliveSec);
  mqtt.setSocketTimeout(5);

  for (;;) {
    bool wifiUp = ensureWifi();
    bool tlsReady = wifiUp && ensureTime();  // chain checks need a real clock
    bool mqttUp = tlsReady && ensureMqtt();
    updateOnlineState(mqttUp);
    if (mqttUp) mqtt.loop();

    // New readings from the nodes: publish now, or keep them for later.
    app::TelemetryRecord rec;
    while (xQueueReceive(app::qCloud, &rec, 0) == pdTRUE) {
      if (!(mqttUp && backlog.empty() && publishReading(rec))) backlog.push(rec);
    }
    if (mqttUp && !backlog.empty()) flushBacklog(10);  // a few per pass, keep MQTT responsive

    // Node heartbeats: publish the freshest ones and drop the rest. If MQTT is down the
    // queued ones are stale by the time it returns, and @msg/sdl/gw/state carries the latest
    // health values anyway.
    app::NodeSysRecord srec;
    while (xQueueReceive(app::qCloudSys, &srec, 0) == pdTRUE) {
      if (mqttUp) publishNodeTelemetry(srec);
    }

    // Node presence, retained on sdl/sensor/status: republish on any transition, after a
    // reconnect, and periodically so "ts" stays fresh.
    if (mqttUp) {
      const uint32_t sig = presenceSignature();
      if (presenceDue || sig != lastPresenceSig ||
          millis() - lastPresenceMs >= cfg::kPresencePeriodMs) {
        publishSensorStatus();
        lastPresenceSig = sig;
        lastPresenceMs = millis();
        presenceDue = false;
      }
    }

    if (mqttUp && millis() - lastStateMs > cfg::kStatePeriodMs) {
      lastStateMs = millis();
      publishState();
    }

    if (mqttUp && (gwTelemetryDue || millis() - lastGwTelemetryMs >= cfg::kGwTelemetryPeriodMs)) {
      gwTelemetryDue = false;
      lastGwTelemetryMs = millis();
      publishGatewayTelemetry();
    }

    handleAlerts(wifiUp && tlsReady, mqttUp);
    maybeRunAi(wifiUp && tlsReady);

    {
      app::StateLock lock;
      app::state.bufferedReadings = backlog.size();
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

}  // namespace cloud
