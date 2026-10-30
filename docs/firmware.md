# Firmware

## Gateway tasks (FreeRTOS)

| Task | Priority | Responsibility |
|---|:-:|---|
| `ControlTask` | 4 | Safety, stop-button events, closed-loop control of filters + PWM |
| `EspNowRxTask` | 3 | Drain received packets, de-duplicate, keep per-node state |
| `SensorTask` | 2 | VL53L0X, PIR, INA219 |
| `CloudTask` | 1 | MQTTS, store-and-forward buffer, AI requests, Discord alerts |

ISRs and the ESP-NOW callback only enqueue work; everything else happens in tasks.

## Embedded Engineering Depth

| Item | Implementation | Status |
|---|---|:-:|
| **E1** RTOS multitasking | Four tasks with reasoned priorities, queues and event groups | 🟡 scaffolded |
| **E2** Interrupt-driven I/O | Stop button ISR → `xQueueSendFromISR` → `ControlTask` | 🟡 scaffolded |
| **E4** Reliable communication | seq + ACK/retry node ↔ gateway, ring buffer while offline | 🟡 scaffolded |
| **E5** Security | MQTTS with CA check + device token, HTTPS to AI/Discord, secrets git-ignored | ⚪ planned |
| **E8** Low-level driver | Own register-level I²C drivers for BH1750, TCS34725 and INA219 | ⚪ planned |

---

[← Back to README](../README.md)
