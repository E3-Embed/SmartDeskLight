// // Wi-Fi station ownership: association, reconnection policy and diagnostics.
// //
// // One task talks to the Wi-Fi driver. The Arduino event callback only records what happened;
// // every decision (when to retry, when to rescan, when to restart the radio) is made in the
// // manager task. Two callers issuing WiFi.begin()/WiFi.disconnect() against each other is how
// // the previous code produced a permanent "connected once, then reason 2/8 forever" loop: the
// // second call aborts the first association, and the abort surfaces as "assoc leave" or, on an
// // AP that still holds the half-open association, "auth expire".
// #pragma once
// #include <Arduino.h>
// #include <IPAddress.h>

// namespace wifi_link {

// // Configure the radio, register the event handler and create the event queue. Call once, in
// // setup(), after app::init() and before espnow_link::begin().
// void configure();

// // Start the manager task. It begins associating immediately and never stops retrying.
// // Call after espnow_link::begin(), so the two never initialise the driver at once.
// void start();

// // ---- state for the rest of the firmware
// bool up();               // associated and holding an IP address
// uint8_t channel();       // 0 while unassociated; ESP-NOW follows this channel
// int8_t rssi();
// IPAddress ip();
// uint32_t attempts();     // association attempts since boot
// uint32_t drops();        // disconnects after a session that had an IP
// uint32_t radioResets();  // full driver restarts (recovery escalation)
// uint8_t lastReason();    // last WIFI_REASON_* the driver reported

// const char *reasonName(uint8_t reason);

// }  // namespace wifi_link
