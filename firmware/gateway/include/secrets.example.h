// Copy to secrets.h (git-ignored) and fill in. NEVER commit secrets.h.
#pragma once

// ---- Wi-Fi (bring a phone hotspot to demos)
#define WIFI_SSID        "your-hotspot"
#define WIFI_PASSWORD    "your-password"

// ---- NETPIE2020 device (Device > Key): MQTTS mqtt.netpie.io:8883
#define NETPIE_CLIENT_ID "device-client-id"
#define NETPIE_TOKEN     "device-token"
#define NETPIE_SECRET    "device-secret"

// ---- AI (Google Gemini API key) and Discord webhook; leave "" to disable
#define LLM_API_KEY      ""
#define DISCORD_WEBHOOK  ""

// ---- TLS verification (E5)
// NETPIE (8883), Gemini and Discord all present publicly-trusted certificates, so the
// firmware verifies them against the CA bundle built into the ESP32 (ca_bundle.h) —
// there are no PEM files or fingerprints to paste here.
// For throwaway local debugging only, build with -DALLOW_INSECURE_TLS to skip the
// certificate check. Never ship or demo a build with that flag.
