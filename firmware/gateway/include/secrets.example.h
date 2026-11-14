// Copy to secrets.h (git-ignored) and fill in. NEVER commit secrets.h.
#pragma once

// ---- Wi-Fi (bring a phone hotspot to demos)
#define WIFI_SSID        "your-hotspot"
#define WIFI_PASSWORD    "your-password"

// ---- MQTT device credentials: username (NETPIE_TOKEN) and password (NETPIE_SECRET)
// for the gateway on the self-hosted EMQX. The names are kept from the NETPIE layout so
// existing secrets.h files keep working.
// The MQTT client id is cfg::kDeviceName in src/config.h; it must be a unique id on the
// broker (the EMQX default authenticator does not pin it, but duplicates kick each other off).
#define NETPIE_TOKEN     "device-username"
#define NETPIE_SECRET    "device-password"

// ---- AI (Google Gemini API key) and Discord webhook; leave "" to disable
#define LLM_API_KEY      ""
#define DISCORD_WEBHOOK  ""

// ---- TLS verification (E5)
// NETPIE (8883), Gemini and Discord all present publicly-trusted certificates, so the
// firmware verifies them against the CA bundle built into the ESP32 (ca_bundle.h) —
// there are no PEM files or fingerprints to paste here.
// For throwaway local debugging only, build with -DALLOW_INSECURE_TLS to skip the
// certificate check. Never ship or demo a build with that flag.
