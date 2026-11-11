#include "ai_client.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

#include "secrets.h"

namespace ai {
namespace {

const char *kPrompt =
    "You control a smart desk lamp for a university student. It has three physical filters "
    "that can each be in or out of the light path: diffuser (less glare), ND (dimmer), "
    "warm/CTO (less blue light). The gateway fine-tunes brightness with PWM to reach your "
    "target lux. Recommend the lighting for the situation below. Keep target_lux between 200 "
    "and 750 and target_cct between 2700 and 6500. Respect the user's feedback history "
    "(+1 = said too bright, -1 = said too dim, newest first). Reply with JSON only: "
    "{\"target_lux\": int, \"target_cct\": int, \"filters\": [diffuser, nd, warm] as 0 or 1, "
    "\"reason\": short string}.\nSituation: ";

String buildSituation(const Context &c) {
  JsonDocument doc;
  doc["activity"] = app::modeName(c.mode);
  doc["hour"] = c.hour;
  doc["desk_lux"] = static_cast<int>(c.lux);
  doc["desk_cct"] = c.cct;
  doc["user_distance_mm"] = c.distMm;
  doc["user_present"] = c.presence;
  JsonArray f = doc["current_filters"].to<JsonArray>();
  for (bool on : c.filters) f.add(on ? 1 : 0);
  doc["current_pwm"] = c.pwm;
  JsonArray fb = doc["feedback"].to<JsonArray>();
  for (int i = 0; i < c.feedbackCount; i++) fb.add(c.feedback[i]);
  String s;
  serializeJson(doc, s);
  return s;
}

}  // namespace

bool requestProfile(const Context &ctx, app::Profile &out) {
  if (strlen(LLM_API_KEY) == 0) return false;

  WiFiClientSecure tls;
  if (strlen(GOOGLE_API_CA_PEM) > 0) {
    tls.setCACert(GOOGLE_API_CA_PEM);
  } else {
    tls.setInsecure();  // development only: fill GOOGLE_API_CA_PEM in secrets.h
  }

  HTTPClient http;
  String url = String("https://generativelanguage.googleapis.com/v1beta/models/") +
               cfg::kAiModel + ":generateContent";
  if (!http.begin(tls, url)) return false;
  http.setTimeout(10000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-goog-api-key", LLM_API_KEY);  // key in a header, not in the URL

  JsonDocument req;
  req["contents"][0]["parts"][0]["text"] = String(kPrompt) + buildSituation(ctx);
  req["generationConfig"]["responseMimeType"] = "application/json";
  req["generationConfig"]["temperature"] = 0.2;
  String body;
  serializeJson(req, body);

  uint32_t t0 = millis();
  int code = http.POST(body);
  if (code != 200) {
    Serial.printf("[ai] HTTP %d\n", code);
    http.end();
    return false;
  }
  String payload = http.getString();
  http.end();

  JsonDocument resp;
  if (deserializeJson(resp, payload)) return false;
  const char *text = resp["candidates"][0]["content"]["parts"][0]["text"];
  if (!text) return false;

  JsonDocument ans;
  if (deserializeJson(ans, text)) return false;
  if (!ans["target_lux"].is<float>() || !ans["filters"].is<JsonArray>()) return false;

  out.targetLux = ans["target_lux"].as<float>();
  out.targetCct = ans["target_cct"] | 4000;
  JsonArray f = ans["filters"];
  for (int i = 0; i < 3; i++) out.filters[i] = (f[i] | 0) != 0;
  out.fromAi = true;
  Serial.printf("[ai] %u ms -> %.0f lux, %u K, filters %d%d%d, %s\n",
                static_cast<unsigned>(millis() - t0), out.targetLux, out.targetCct, out.filters[0], out.filters[1], out.filters[2],
                ans["reason"] | "");
  return true;
}

}  // namespace ai
