// Copy to secrets.h (git-ignored) and fill in. NEVER commit secrets.h.
#pragma once

// ---- Wi-Fi (bring a phone hotspot to demos)
#define WIFI_SSID        "your-hotspot"
#define WIFI_PASSWORD    "your-password"

// ---- NETPIE2020 device (Device > Key): MQTTS mqtt.netpie.io:1884
#define NETPIE_CLIENT_ID "device-client-id"
#define NETPIE_TOKEN     "device-token"
#define NETPIE_SECRET    "device-secret"

// ---- AI (Google Gemini API key) and Discord webhook; leave "" to disable
#define LLM_API_KEY      ""
#define DISCORD_WEBHOOK  ""

// ---- Root CA certificates (PEM) for TLS verification (E5).
// NETPIE: leave NETPIE_CA_PEM empty. The broker uses a private CA that it does not send, so the
// firmware pins the broker certificate by SHA-256 fingerprint instead (cfg::kMqttCertSha256).
// Google / Discord: get the root of the chain with
//   openssl s_client -connect discord.com:443 -showcerts </dev/null
// and paste the LAST certificate of the chain (the root) between the quotes, one line per
// PEM line ending in \n. Empty string = TLS without certificate check (development only).
#define NETPIE_CA_PEM ""
#define GOOGLE_API_CA_PEM ""
#define DISCORD_CA_PEM ""
