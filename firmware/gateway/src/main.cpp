// SmartDeskLight — Gateway (ESP32 B)
//
// FreeRTOS tasks (E1), highest priority first:
//   ControlTask   P4  core 1  safety + closed-loop control of filters and LED      control.cpp
//   EspNowRxTask  P3  core 1  drain ESP-NOW packets, de-duplicate, node table      espnow_link.cpp
//   SensorTask    P2  core 1  VL53L0X, PIR, INA219 (own driver, E8)              sensors.cpp
//   CloudTask     P1  core 0  NETPIE MQTTS (E5), store-and-forward (E4), AI, alerts  cloud.cpp
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

  lamp::begin();     // filters out, LED off: known state before anything else runs
  sensors::begin();

  // Wi-Fi first: ESP-NOW then runs on the access point's channel.
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);  // keep the radio awake for ESP-NOW
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(250);  // up to 10 s
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

// Arduino loop (priority 1): status LED only. Solid = cloud up, blinking = offline.
void loop() {
  bool cloudUp;
  {
    app::StateLock lock;
    cloudUp = app::state.cloudUp;
  }
  digitalWrite(cfg::kPinStatusLed, cloudUp ? HIGH : !digitalRead(cfg::kPinStatusLed));
  delay(500);
}
