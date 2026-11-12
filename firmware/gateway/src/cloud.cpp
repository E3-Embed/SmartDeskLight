#include "cloud.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
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
uint32_t lastShadowMs = 0;
uint32_t lastAiMs = 0;
uint32_t lastNtpRetryMs = 0;
bool timeConfigured = false;
bool wasOnline = false;
uint32_t offlineSinceMs = 0;

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
// Every TLS endpoint (NETPIE 8883, Google, Discord) is verified against the built-in
// CA bundle, and chain verification compares the certificate's validity dates with
// the system clock. Until NTP has set that clock, every handshake fails with
// "certificate is not yet valid", so nothing may connect before the time is real.
bool timeValid() { return app::nowEpoch() != 0; }  // same threshold the rest of the app uses

bool ensureTime() {
  if (timeValid()) return true;
  if (!timeConfigured) {
    configTime(cfg::kUtcOffsetSec, 0, "pool.ntp.org", "time.google.com", "time.nist.gov");
    timeConfigured = true;
    lastNtpRetryMs = millis();
    Serial.println("[cloud] waiting for NTP sync before TLS...");
  } else if (millis() - lastNtpRetryMs > 60000) {
    // SNTP never landed (blocked UDP/123, dead DNS): arm it again instead of failing forever.
    configTime(cfg::kUtcOffsetSec, 0, "pool.ntp.org", "time.google.com", "time.nist.gov");
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
      Serial.printf("[cloud] TLS connect to NETPIE failed (clock=%lld)\n",
                    static_cast<long long>(time(nullptr)));
      return false;
    }
  }

  // NETPIE2020: client id = device Client ID, username = Token, password = Secret.
  if (!mqtt.connect(NETPIE_CLIENT_ID, NETPIE_TOKEN, NETPIE_SECRET)) {
    Serial.printf("[cloud] MQTTS connect failed, state %d\n", mqtt.state());
    return false;
  }
  mqtt.subscribe(cfg::kTopicCmd);
  xEventGroupSetBits(app::events, app::kBitMqttUp);
  Serial.println("[cloud] MQTTS connected to NETPIE2020");
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
  char topic[48];
  snprintf(topic, sizeof(topic), "@msg/sdl/%s/telemetry", nodeName);
  return mqtt.publish(topic, reinterpret_cast<const uint8_t *>(payload), n);
}

void publishShadow() {
  JsonDocument doc;
  JsonObject d = doc["data"].to<JsonObject>();
  {
    app::StateLock lock;
    const auto &s = app::state;
    uint32_t now = millis();
    for (const auto &n : s.nodes) {
      if (!n.used) continue;
      char key[24];
      snprintf(key, sizeof(key), "n%u_lux", n.id);   d[key] = n.lux;
      snprintf(key, sizeof(key), "n%u_cct", n.id);   d[key] = n.cct;
      snprintf(key, sizeof(key), "n%u_age_s", n.id); d[key] = (now - n.lastSeenMs) / 1000;
      snprintf(key, sizeof(key), "n%u_rx", n.id);    d[key] = n.received;
      snprintf(key, sizeof(key), "n%u_seq", n.id);   d[key] = n.lastSeq;
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

  char payload[1024];
  size_t n = serializeJson(doc, payload, sizeof(payload));
  mqtt.publish(cfg::kTopicShadow, reinterpret_cast<const uint8_t *>(payload), n);
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
  // NETPIE's 8883 chain ends at "USERTrust RSA Certification Authority" and Google /
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
  mqtt.setBufferSize(1024);
  mqtt.setKeepAlive(30);
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

    if (mqttUp && millis() - lastShadowMs > cfg::kShadowPeriodMs) {
      lastShadowMs = millis();
      publishShadow();
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
