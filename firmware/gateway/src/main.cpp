// SmartDeskLight — Gateway (ESP32-S3)
//
// FreeRTOS tasks (E1), highest priority first:
//   ControlTask   P4  core 1  safety + closed-loop control of filters and LED      control.cpp
//   EspNowRxTask  P3  core 1  drain ESP-NOW packets, de-duplicate, node table      espnow_link.cpp
//   SensorTask    P2  core 1  VL53L0X, PIR, INA219 (own driver, E8)              sensors.cpp
//   CloudTask     P1  core 0  MQTTS (E5), store-and-forward (E4), AI, alerts       cloud.cpp
//   StatusLedTask P1  core 1  on-board WS2812 link/safety indication            status_led.cpp
// The stop button is an interrupt (E2): the ISR only posts an event to ControlTask.
#include <Arduino.h>
#include <WiFi.h>

#include "app.h"
#include "cloud.h"
#include "control.h"
#include "espnow_link.h"
#include "lamp.h"
#include "secrets.h"  // copy include/secrets.example.h -> include/secrets.h
#include "sensors.h"
#include "status_led.h"

namespace {

// E2: falling edge on the stop button. Debounced in the ISR; work is deferred to ControlTask.
void IRAM_ATTR onStopButton() {
  static uint32_t lastMs = 0;
  uint32_t now = millis();
  if (now - lastMs < 250) return;
  lastMs = now;

  app::ControlEvent ev{};
  ev.type = app::EventType::StopButton;
  BaseType_t woken = pdFALSE;
  xQueueSendFromISR(app::qControl, &ev, &woken);
  portYIELD_FROM_ISR(woken);
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\nSmartDeskLight gateway starting");

  app::init();
  pinMode(cfg::kPinStatusLed, OUTPUT);
  status_led::begin();  // dark until the first pattern says otherwise
  // Started before the network so the LED can report association (white pulse) and the
  // NTP wait (cyan), which are the two minutes-long phases you otherwise stare at blind.
  xTaskCreatePinnedToCore(status_led::task, "led", 3072, nullptr, 1, nullptr, 1);

  lamp::begin();     // filters out, LED off: known state before anything else runs
  sensors::begin();

  // Wi-Fi first: ESP-NOW then runs on the access point's channel.
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);  // keep the radio awake for ESP-NOW
  WiFi.setHostname(cfg::kDeviceName);  // must be set before begin() to reach the DHCP request
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(250);  // up to 10 s
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[wifi] %s connected to \"%s\", IP %s, channel %d\n", cfg::kDeviceName,
                  WIFI_SSID, WiFi.localIP().toString().c_str(), WiFi.channel());
  } else {
    // 0 = idle, 1 = SSID not found (5 GHz-only hotspot?), 4 = connect failed, 6 = disconnected
    // (usual for a rejected password or an AP that never answered).
    Serial.printf("[wifi] %s NOT connected, status %d — check SSID \"%s\", password, 2.4 GHz\n",
                  cfg::kDeviceName, static_cast<int>(WiFi.status()), WIFI_SSID);
  }
  xEventGroupSetBits(app::events, app::kBitWifiTried);  // from here a failure shows as red
  if (!espnow_link::begin()) {
    Serial.println("ESP-NOW init failed, restarting");
    ESP.restart();
  }

  pinMode(cfg::kPinStopButton, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(cfg::kPinStopButton), onStopButton, FALLING);

  xTaskCreatePinnedToCore(control::task, "control", 4096, nullptr, 4, nullptr, 1);
  xTaskCreatePinnedToCore(espnow_link::rxTask, "espnow", 4096, nullptr, 3, nullptr, 1);
  xTaskCreatePinnedToCore(sensors::task, "sensor", 4096, nullptr, 2, nullptr, 1);
  xTaskCreatePinnedToCore(cloud::task, "cloud", 12288, nullptr, 1, nullptr, 0);  // TLS needs stack
  if (cfg::kSimulatedNodes > 0) {
    xTaskCreatePinnedToCore(espnow_link::simulatorTask, "sim", 3072, nullptr, 1, nullptr, 1);
  }
}

// Arduino loop (priority 1): external status LED only. Solid = cloud up, blinking = offline.
// The on-board RGB LED is driven by status_led::task.
void loop() {
  bool cloudUp;
  {
    app::StateLock lock;
    cloudUp = app::state.cloudUp;
  }
  digitalWrite(cfg::kPinStatusLed, cloudUp ? HIGH : !digitalRead(cfg::kPinStatusLed));
  delay(500);
}
