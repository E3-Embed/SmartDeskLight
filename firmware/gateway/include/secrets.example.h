// Copy to secrets.h (git-ignored) and fill in. NEVER commit secrets.h.
#pragma once

// ---- Wi-Fi (bring a phone hotspot to demos)
#define WIFI_SSID        "your-hotspot"
#define WIFI_PASSWORD    "your-password"

// ---- EMQX (main broker): the gateway's username / password on the self-hosted EMQX.
// The MQTT client id is cfg::kDeviceName in src/config.h; it must be a unique id on the
// broker (duplicates kick each other off).
// Older secrets.h files kept this login in NETPIE_TOKEN / NETPIE_SECRET; that still builds
// as long as NETPIE_CLIENT_ID is not defined.
#define MQTT_USERNAME    "device-username"
#define MQTT_PASSWORD    "device-password"

// ---- NETPIE2020 mirror (optional): the `gateway` device in project SmartDeskLight
// (Device > Key in portal.netpie.io). Leave NETPIE_CLIENT_ID "" to turn the mirror off.
#define NETPIE_CLIENT_ID ""
#define NETPIE_TOKEN     ""
#define NETPIE_SECRET    ""

// ---- AI (Google Gemini API key) and Discord webhook; leave "" to disable
#define LLM_API_KEY      ""
#define DISCORD_WEBHOOK  ""

// ---- TLS verification (E5)
// EMQX and NETPIE (both 8883), Gemini and Discord all present publicly-trusted certificates, so the
// firmware verifies them against the CA bundle built into the ESP32 (ca_bundle.h) —
// there are no PEM files or fingerprints to paste here.
// For throwaway local debugging only, build with -DALLOW_INSECURE_TLS to skip the
// certificate check. Never ship or demo a build with that flag.
