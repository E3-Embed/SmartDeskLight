// #include "wifi_link.h"

// #include <WiFi.h>
// #include <esp_system.h>
// #include <esp_wifi.h>
// #include <string.h>

// #include "app.h"
// #include "config.h"
// #include "espnow_link.h"
// #include "secrets.h"

// namespace wifi_link {

// void task(void *);  // the manager loop, defined at the bottom of this file

// namespace {

// // ---------------------------------------------------------------- events
// // The Wi-Fi event callback runs in the driver's event task. It must never call back into the
// // driver (no begin/disconnect/scan): that is what turns one failure into an abort storm. It
// // only describes what happened and returns.
// struct WifiEvent {
//   enum class Kind : uint8_t { Started, Associated, GotIp, LostIp, Disconnected } kind;
//   uint8_t reason;   // Disconnected
//   uint8_t channel;  // Associated
// };

// QueueHandle_t eventQueue = nullptr;

// // Written by the event task or the manager, read by other tasks. 32-bit scalars are atomic on
// // the ESP32, so no lock is needed for a status read.
// volatile bool upValue = false;
// volatile uint8_t lastReasonValue = 0;
// volatile uint32_t attemptsValue = 0;
// volatile uint32_t dropsValue = 0;
// volatile uint32_t resetsValue = 0;

// void onWifiEvent(arduino_event_t *e) {
//   WifiEvent ev{};
//   switch (e->event_id) {
//     case ARDUINO_EVENT_WIFI_STA_START:
//       ev.kind = WifiEvent::Kind::Started;
//       break;
//     case ARDUINO_EVENT_WIFI_STA_CONNECTED:
//       ev.kind = WifiEvent::Kind::Associated;
//       ev.channel = e->event_info.wifi_sta_connected.channel;
//       break;
//     case ARDUINO_EVENT_WIFI_STA_GOT_IP:
//       ev.kind = WifiEvent::Kind::GotIp;
//       break;
//     case ARDUINO_EVENT_WIFI_STA_LOST_IP:
//       ev.kind = WifiEvent::Kind::LostIp;
//       break;
//     case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
//       ev.kind = WifiEvent::Kind::Disconnected;
//       ev.reason = e->event_info.wifi_sta_disconnected.reason;
//       lastReasonValue = ev.reason;  // visible to telemetry even if the queue is full
//       break;
//     default:
//       return;
//   }
//   if (eventQueue) xQueueSend(eventQueue, &ev, 0);  // never block the event task
// }

// // ---------------------------------------------------------------- manager state
// enum class Phase : uint8_t { Idle, Associating, Online };

// Phase phase = Phase::Idle;
// uint32_t attemptStartedMs = 0;
// uint32_t nextAttemptMs = 0;
// uint32_t upSinceMs = 0;
// uint32_t fails = 0;          // consecutive failed attempts
// bool associated = false;     // STA_CONNECTED seen, DHCP not finished yet
// bool firstOutcome = false;   // first attempt resolved (LED: white pulse -> red/normal)
// bool needScan = true;        // scan before the next begin()
// bool wantRadioReset = false;

// // The BSSID/channel the last scan picked. Connecting to an explicit BSSID removes the
// // driver's guesswork on mesh/extender setups and pins the channel we already verified.
// struct Target {
//   bool set = false;
//   uint8_t bssid[6] = {};
//   uint8_t channel = 0;
// } target;

// const char *authName(wifi_auth_mode_t mode) {
//   switch (mode) {
//     case WIFI_AUTH_OPEN: return "open";
//     case WIFI_AUTH_WEP: return "WEP";
//     case WIFI_AUTH_WPA_PSK: return "WPA";
//     case WIFI_AUTH_WPA2_PSK: return "WPA2";
//     case WIFI_AUTH_WPA_WPA2_PSK: return "WPA/WPA2";
//     case WIFI_AUTH_WPA2_ENTERPRISE: return "WPA2-Enterprise (unsupported)";
//     case WIFI_AUTH_WPA3_PSK: return "WPA3-only (unlikely to work)";
//     case WIFI_AUTH_WPA2_WPA3_PSK: return "WPA2/WPA3";
//     default: return "other";
//   }
// }

// void markFirstOutcome() {
//   if (firstOutcome) return;
//   firstOutcome = true;
//   xEventGroupSetBits(app::events, app::kBitWifiTried);
// }

// // ---------------------------------------------------------------- radio setup
// // Must be reached with the driver stopped or freshly started, never mid-connect.
// void applyRadioConfig() {
//   WiFi.persistent(false);  // credentials live in secrets.h; no NVS write per begin()
//   WiFi.mode(WIFI_STA);

//   // The regulatory domain decides which channels the station may transmit on. The ESP32
//   // default is the world-safe "01" domain: channels 1-11 only. An AP that auto-selected 12
//   // or 13 is then visible in a scan, but every auth frame goes out on a channel the PHY is
//   // not allowed to use, the AP never answers, and the join fails with reason 2 ("auth
//   // expire") on a perfectly healthy network. Thailand allows 1-13 and the firmware's country
//   // table has no "TH", so a 13-channel domain is used (see cfg::kWifiCountry).
//   if (esp_wifi_set_country_code(cfg::kWifiCountry, false) != ESP_OK) {
//     Serial.printf("[wifi] country \"%s\" rejected, channels 12-13 stay unavailable\n",
//                   cfg::kWifiCountry);
//   }

//   WiFi.setHostname(cfg::kDeviceName);  // must precede the association to reach the DHCP request
//   WiFi.setScanMethod(WIFI_FAST_SCAN);
//   WiFi.setSortMethod(WIFI_CONNECT_AP_BY_SIGNAL);
//   WiFi.setAutoReconnect(false);  // the manager owns reconnection; see the header
//   WiFi.setSleep(false);          // modem sleep misses beacons, and ESP-NOW needs the radio up
// }

// // ---------------------------------------------------------------- retry policy
// // One table per failure class. The point is to stop retrying at the same rate for causes that
// // need opposite treatment: a missed beacon needs a quick retry, a rejected password does not
// // get better by retrying, and a full hotspot needs a long wait.
// uint32_t backoffMs(uint8_t reason, uint32_t failCount) {
//   uint32_t base;
//   switch (reason) {
//     // Voluntary (our own disconnect) or the AP rebooted. Retry at once.
//     case 3:   // auth leave
//     case 8:   // assoc leave
//     case 206: // AP TSF reset
//       base = 500;
//       break;
//     // The AP rejected the station. Waiting will not fix a password, so slow right down and
//     // leave the link alone instead of hammering the AP with fresh handshakes.
//     case 15:  // 4-way handshake timeout
//     case 23:  // 802.1X auth failed
//     case 24:  // cipher suite rejected
//     case 202: // auth fail
//     case 204: // handshake timeout
//       base = 30000;
//       break;
//     case 5:  // too many stations: only time helps
//       base = 60000;
//       break;
//     // The AP did not answer (auth/assoc timeout, 802.11 timeout, beacon timeout). Usually
//     // transient — the AP was busy, asleep, or we were on the wrong channel — so retry soon.
//     case 1:
//     case 2:
//     case 4:
//     case 39:
//     case 205:
//       base = (failCount <= 1) ? 2000 : 5000;
//       break;
//     // The AP is not visible at all: out of range, 5 GHz-only, or the wrong SSID. Scanning
//     // before the next attempt, then waiting, is the only useful action.
//     case 200:
//     case 201:
//       base = 10000;
//       break;
//     default:
//       base = 5000;
//       break;
//   }

//   // Double on every further consecutive failure, up to the ceiling.
//   uint32_t ms = base;
//   for (uint32_t i = 1; i < failCount && ms < cfg::kWifiRetryMaxMs; ++i) ms *= 2;
//   if (ms > cfg::kWifiRetryMaxMs) ms = cfg::kWifiRetryMaxMs;
//   return ms + esp_random() % 1000;  // jitter: several gateways must not retry in lockstep
// }

// // ---------------------------------------------------------------- steps
// void scan() {
//   // A scan and an association share the radio, so this runs only while disconnected.
//   Serial.printf("[wifi] scanning for \"%s\"...\n", WIFI_SSID);
//   const int16_t count = WiFi.scanNetworks(false /*blocking*/, true /*hidden*/, false, 120, 0,
//                                          WIFI_SSID);
//   target.set = false;
//   if (count < 0) {
//     // The interface was still starting (mode change, radio reset). Fall back to an unscanned
//     // begin(): the driver scans on its own, it just cannot be pinned to a BSSID here.
//     Serial.printf("[wifi] scan failed (%d), joining without a pinned BSSID\n",
//                   static_cast<int>(count));
//     WiFi.scanDelete();
//     return;
//   }
//   if (count == 0) {
//     Serial.println("[wifi] no matching AP: hidden SSID, out of range, or 5 GHz-only");
//     WiFi.scanDelete();
//     return;
//   }

//   int best = -1;
//   for (int i = 0; i < count; ++i) {
//     const uint8_t *bssid = WiFi.BSSID(i);
//     Serial.printf("[wifi]  ch=%ld rssi=%ld auth=%-15s %02X:%02X:%02X:%02X:%02X:%02X\n",
//                   static_cast<long>(WiFi.channel(i)), static_cast<long>(WiFi.RSSI(i)),
//                   authName(WiFi.encryptionType(i)), bssid[0], bssid[1], bssid[2], bssid[3],
//                   bssid[4], bssid[5]);
//     if (best < 0 || WiFi.RSSI(i) > WiFi.RSSI(best)) best = i;
//   }
//   if (best >= 0) {
//     const uint8_t *bssid = WiFi.BSSID(best);
//     memcpy(target.bssid, bssid, sizeof(target.bssid));
//     target.channel = static_cast<uint8_t>(WiFi.channel(best));
//     target.set = true;
//     Serial.printf("[wifi] strongest is ch%u at %ld dBm, joining that BSSID\n", target.channel,
//                   static_cast<long>(WiFi.RSSI(best)));
//   }
//   WiFi.scanDelete();
// }

// // Full driver restart. Recovers the states no amount of retrying reaches: a supplicant stuck
// // in "connecting", a country/channel table left in a bad shape, or a driver that stopped
// // emitting events. ESP-NOW is attached to the same radio and has to be detached first.
// void radioReset() {
//   resetsValue++;
//   Serial.println("[wifi] restarting the radio (ESP-NOW detached for the reset)");
//   // Report the link as down before touching the driver: the cloud task may still be holding a
//   // TLS session, and it should tear that down rather than wait for the disconnect event.
//   upValue = false;
//   associated = false;
//   xEventGroupClearBits(app::events, app::kBitWifiUp);
//   espnow_link::suspend();
//   WiFi.disconnect(true);  // stop the station
//   WiFi.mode(WIFI_OFF);    // stop the driver, which clears the association state machine
//   vTaskDelay(pdMS_TO_TICKS(250));
//   applyRadioConfig();     // STA mode again, country, hostname, no sleep, no auto-reconnect
//   espnow_link::resume();  // re-register the ESP-NOW receive callback on the new interface
//   target.set = false;     // the old BSSID may be stale after an outage
//   needScan = true;
//   phase = Phase::Idle;
//   nextAttemptMs = millis() + 500;
// }

// void attempt() {
//   // ESP-NOW rides on the station interface. If it could not re-attach after a radio reset,
//   // this is the retry point — never during the reset itself.
//   espnow_link::resume();

//   if (needScan) {
//     scan();
//     needScan = false;
//   }

//   attemptsValue++;
//   Serial.printf("[wifi] joining \"%s\" (attempt %lu%s)\n", WIFI_SSID,
//                 static_cast<unsigned long>(attemptsValue),
//                 target.set ? ", pinned BSSID" : "");

//   const wl_status_t st = target.set
//                              ? WiFi.begin(WIFI_SSID, WIFI_PASSWORD, target.channel, target.bssid)
//                              : WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

//   if (st == WL_CONNECT_FAILED) {
//     // The driver refused because it is still busy with the previous attempt (ESP_ERR_WIFI_STATE)
//     // or the credentials are structurally invalid. Back off instead of calling begin() again
//     // in a tight loop — that loop is worse than the original problem.
//     Serial.println("[wifi] begin() rejected by the driver, retrying after a pause");
//     fails++;
//     nextAttemptMs = millis() + 2000;
//     return;
//   }

//   attemptStartedMs = millis();
//   associated = false;
//   phase = Phase::Associating;
// }

// void onGotIp() {
//   phase = Phase::Online;
//   upValue = true;
//   associated = true;
//   fails = 0;
//   upSinceMs = millis();
//   markFirstOutcome();
//   xEventGroupSetBits(app::events, app::kBitWifiUp);
//   Serial.printf("[wifi] \"%s\" up: IP %s, channel %u, %d dBm\n", WIFI_SSID,
//                 WiFi.localIP().toString().c_str(), WiFi.channel(), WiFi.RSSI());
//   // Re-applied on every join: the setting does not survive an interface restart, and modem
//   // sleep is what makes an idle station miss beacons and get dropped by a busy AP.
//   WiFi.setSleep(false);
// }

// void onDisconnected(uint8_t reason) {
//   const bool wasUp = upValue;
//   upValue = false;
//   associated = false;
//   phase = Phase::Idle;
//   xEventGroupClearBits(app::events, app::kBitWifiUp);
//   markFirstOutcome();
//   lastReasonValue = reason;

//   if (wasUp) {
//     dropsValue++;
//     // A dropped session is the first failure of the next attempt sequence, not a clean slate:
//     // a link that keeps coming up and immediately falling over must still escalate to a radio
//     // reset instead of flapping forever at the fast retry interval.
//     fails = 1;
//     Serial.printf("[wifi] link lost after %lu s, reason %u: %s\n",
//                   static_cast<unsigned long>((millis() - upSinceMs) / 1000), reason,
//                   reasonName(reason));
//     // A router that auto-selected a channel may have moved, and the cached BSSID would just
//     // time out again. Scan on a drop as well as when the AP disappeared from a scan.
//     needScan = true;
//   } else {
//     fails++;
//     Serial.printf("[wifi] join failed, reason %u: %s (failure %lu)\n", reason,
//                   reasonName(reason), static_cast<unsigned long>(fails));
//     if (reason == 200 || reason == 201) needScan = true;
//   }

//   if (fails >= cfg::kWifiRadioResetAfterFails) wantRadioReset = true;
//   nextAttemptMs = millis() + backoffMs(reason, fails);
// }

// void handle(const WifiEvent &ev) {
//   switch (ev.kind) {
//     case WifiEvent::Kind::Started:
//       Serial.println("[wifi] interface started");
//       break;
//     case WifiEvent::Kind::Associated:
//       associated = true;
//       Serial.printf("[wifi] associated, channel %u (waiting for DHCP)\n", ev.channel);
//       break;
//     case WifiEvent::Kind::GotIp:
//       onGotIp();
//       break;
//     case WifiEvent::Kind::LostIp:
//       // DHCP lease lost but the link is still up. The driver keeps the association; the
//       // address usually returns on renewal, so only report it. A full drop follows if not.
//       Serial.println("[wifi] IP address lost, waiting for the lease to come back");
//       break;
//     case WifiEvent::Kind::Disconnected:
//       onDisconnected(ev.reason);
//       break;
//   }
// }

// }  // namespace

// // ---------------------------------------------------------------- public API
// const char *reasonName(uint8_t reason) {
//   switch (reason) {
//     case 1: return "unspecified";
//     case 2: return "auth expire (AP did not answer: asleep, client limit, wrong channel, or bad password)";
//     case 3: return "auth leave (AP went away)";
//     case 4: return "assoc expire (AP dropped an idle station)";
//     case 5: return "too many stations (hotspot client limit)";
//     case 6: return "not authenticated";
//     case 7: return "not associated";
//     case 8: return "assoc leave (our own disconnect)";
//     case 9: return "assoc but not authenticated";
//     case 15: return "4-way handshake timeout (wrong password or WPA3-only)";
//     case 16: return "group key update timeout";
//     case 17: return "4-way IE differs";
//     case 18: return "group cipher invalid";
//     case 19: return "pairwise cipher invalid";
//     case 20: return "AKMP invalid";
//     case 23: return "802.1X auth failed";
//     case 24: return "cipher suite rejected";
//     case 39: return "802.11 timeout (AP stopped answering)";
//     case 67: return "link establishment failed";
//     case 200: return "beacon timeout (out of range or AP gone)";
//     case 201: return "no AP found (5 GHz-only, wrong SSID, or out of range)";
//     case 202: return "auth fail (AP rejected the station: password or client policy)";
//     case 203: return "assoc fail";
//     case 204: return "handshake timeout (wrong password?)";
//     case 205: return "connection fail (AP never completed the exchange)";
//     case 206: return "AP timestamp reset (AP rebooted)";
//     case 207: return "roaming";
//     default: return "other";
//   }
// }

// void configure() {
//   eventQueue = xQueueCreate(16, sizeof(WifiEvent));
//   configASSERT(eventQueue);
//   WiFi.onEvent(onWifiEvent);  // registered before the interface starts, so nothing is missed
//   applyRadioConfig();
// }

// void start() {
//   xTaskCreatePinnedToCore(task, "wifi", 4096, nullptr, 2, nullptr, 0);
// }

// bool up() { return upValue; }
// uint8_t channel() { return WiFi.channel(); }
// int8_t rssi() { return static_cast<int8_t>(WiFi.RSSI()); }
// IPAddress ip() { return WiFi.localIP(); }
// uint32_t attempts() { return attemptsValue; }
// uint32_t drops() { return dropsValue; }
// uint32_t radioResets() { return resetsValue; }
// uint8_t lastReason() { return lastReasonValue; }

// void task(void *) {
//   Serial.println("[wifi] manager running");
//   for (;;) {
//     WifiEvent ev;
//     if (xQueueReceive(eventQueue, &ev, pdMS_TO_TICKS(250)) == pdTRUE) handle(ev);

//     const uint32_t now = millis();
//     switch (phase) {
//       case Phase::Online:
//         // Nothing to poll normally: the disconnect event moves us out of this state. If the
//         // driver left WL_CONNECTED without producing that event, "up" would otherwise stay
//         // true forever — the most common way a device silently never comes back.
//         if (WiFi.status() != WL_CONNECTED) {
//           Serial.println("[wifi] status dropped without a disconnect event, treating it as one");
//           WiFi.disconnect(false);  // let the driver emit its own event as well
//           onDisconnected(1);
//         }
//         break;
//       case Phase::Associating:
//         if (associated && now - attemptStartedMs > cfg::kWifiDhcpTimeoutMs) {
//           Serial.println("[wifi] associated but DHCP never finished, restarting the attempt");
//           WiFi.disconnect(false);  // the disconnect event schedules the retry
//           phase = Phase::Idle;
//           nextAttemptMs = now + 1000;
//         } else if (now - attemptStartedMs > cfg::kWifiConnectTimeoutMs) {
//           // The driver normally reports its own failure. This is the safety net for a connect
//           // that neither succeeds nor fails, which would otherwise wedge the manager here.
//           // The disconnect normally produces the event that schedules the retry; the timer
//           // below keeps the manager moving even if it does not.
//           Serial.println("[wifi] join attempt timed out with no driver event, restarting it");
//           WiFi.disconnect(false);
//           phase = Phase::Idle;
//           nextAttemptMs = now + 3000;
//         }
//         break;
//       case Phase::Idle:
//         if (now >= nextAttemptMs) {
//           if (wantRadioReset) {
//             wantRadioReset = false;
//             radioReset();
//           }
//           attempt();
//         }
//         break;
//     }
//   }
// }

// }  // namespace wifi_link
