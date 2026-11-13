// On-board WS2812 status light (ESP32-S3-DevKitC-1, GPIO48).
//
//   white, flash at boot   firmware started, LED works
//   white, slow pulse      joining the access point (still retrying)
//   red, fast blink        Wi-Fi attempt failed (SSID missing, wrong password, 5 GHz AP)
//   cyan, slow blink       Wi-Fi up, waiting for NTP before TLS may start
//   amber, slow blink      clock set, MQTT/TLS not connected yet
//   magenta, slow blink    cloud up, but no fresh data from the sensor node
//   green, solid           cloud up and the primary sensor node is reporting
//   blue, double blink     safe state from the stop button (overrides the link colours)
//
// Priority: safe > Wi-Fi > clock > MQTT > node freshness. One pixel, so this is
// deliberately cheap: the RMT transfer is ~30 us and the task wakes every 50 ms.
#pragma once

namespace status_led {

void begin();
void task(void *);

}  // namespace status_led
