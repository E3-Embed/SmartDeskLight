// ca_bundle.h — attach the ESP32's built-in Mozilla CA bundle to a WiFiClientSecure.
//
// The bundle is the public root store shipped with the Arduino core, so every
// publicly-trusted endpoint we talk to (NETPIE on 8883, Google, Discord) verifies
// against it with no PEM files, no fingerprint pinning and no setInsecure().
//
// One caveat: chain verification compares certificate validity dates with the
// system clock, so NTP has to have synced before the first handshake (see
// cloud.cpp ensureTime()).
//
// Arduino-ESP32 2.x (what PlatformIO's espressif32 pins today) only offers
// setCACertBundle(bundle) and wants the bundle blob the core embeds; 3.x adds
// useBuiltinCACertBundle(). Keep that difference in this one place so call sites
// stay readable and a core upgrade only touches this file.
#pragma once

#include <WiFiClientSecure.h>

namespace ca {

#if defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)

inline void useBuiltin(WiFiClientSecure &client) {
  client.useBuiltinCACertBundle();
}

#else

// The core embeds the full root store as x509_crt_bundle.bin; this is its symbol.
// setCACertBundle() checks for NULL and falls back to that embedded blob.
extern const uint8_t rootca_crt_bundle_start[] asm("_binary_x509_crt_bundle_start");

inline void useBuiltin(WiFiClientSecure &client) {
  client.setCACertBundle(rootca_crt_bundle_start);
}

#endif

}  // namespace ca
