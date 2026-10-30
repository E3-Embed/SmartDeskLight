// SmartDeskLight — Gateway (ESP32 B)
// FreeRTOS tasks (E1): ControlTask > EspNowRxTask > SensorTask > CloudTask
#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include "message.h"
#include "secrets.h"   // copy include/secrets.example.h -> include/secrets.h

static const int STOP_BUTTON_PIN = 0;  // TODO: choose pin

static QueueHandle_t qTelemetry;  // EspNowRx -> Control / Cloud
static QueueHandle_t qEvents;     // ISR / tasks -> Control

enum EventType : uint8_t { EVT_STOP_BUTTON = 1, EVT_NEW_PROFILE = 2 };

// ---- ESP-NOW receive callback: just queue + ACK, no heavy work here ----
static void onRecv(const uint8_t *mac, const uint8_t *data, int len) {
  if (len != sizeof(SdlTelemetry)) return;
  SdlTelemetry pkt;
  memcpy(&pkt, data, sizeof(pkt));
  SdlAck ack = {SDL_PROTO_VERSION, SDL_MSG_ACK, pkt.node_id, pkt.seq};
  esp_now_send(mac, (const uint8_t *)&ack, sizeof(ack));
  xQueueSend(qTelemetry, &pkt, 0);
}

// ---- E2: ISR only posts an event (deferred processing) ----
static void IRAM_ATTR onStopButton() {
  uint8_t evt = EVT_STOP_BUTTON;
  BaseType_t woken = pdFALSE;
  xQueueSendFromISR(qEvents, &evt, &woken);
  portYIELD_FROM_ISR(woken);
}

static void ControlTask(void *) {
  for (;;) {
    uint8_t evt;
    if (xQueueReceive(qEvents, &evt, pdMS_TO_TICKS(50)) == pdTRUE) {
      if (evt == EVT_STOP_BUTTON) { /* TODO: stop servos, enter safe state */ }
    }
    // TODO: closed-loop control: compare measured lux with target, move filters / PWM
  }
}

static void EspNowRxTask(void *) {
  for (;;) {
    SdlTelemetry pkt;
    if (xQueueReceive(qTelemetry, &pkt, portMAX_DELAY) == pdTRUE) {
      // TODO: dedupe by (node_id, seq), update per-node state, forward to cloud buffer
    }
  }
}

static void SensorTask(void *) {
  for (;;) {
    // TODO: read VL53L0X, PIR, INA219 (own driver)
    vTaskDelay(pdMS_TO_TICKS(200));
  }
}

static void CloudTask(void *) {
  for (;;) {
    // TODO: MQTTS to NETPIE (mqtt.netpie.io:1884), store-and-forward ring buffer (E4),
    //       call LLM API over HTTPS, send Discord alerts
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}

void setup() {
  Serial.begin(115200);
  qTelemetry = xQueueCreate(32, sizeof(SdlTelemetry));
  qEvents = xQueueCreate(8, sizeof(uint8_t));

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  if (esp_now_init() != ESP_OK) { Serial.println("ESP-NOW init failed"); ESP.restart(); }
  esp_now_register_recv_cb(onRecv);

  pinMode(STOP_BUTTON_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(STOP_BUTTON_PIN), onStopButton, FALLING);

  xTaskCreatePinnedToCore(ControlTask,  "control", 4096, nullptr, 4, nullptr, 1);
  xTaskCreatePinnedToCore(EspNowRxTask, "espnow",  4096, nullptr, 3, nullptr, 1);
  xTaskCreatePinnedToCore(SensorTask,   "sensor",  4096, nullptr, 2, nullptr, 1);
  xTaskCreatePinnedToCore(CloudTask,    "cloud",   8192, nullptr, 1, nullptr, 0);
}

void loop() { vTaskDelete(nullptr); }
