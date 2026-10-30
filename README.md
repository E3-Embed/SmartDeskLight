# SmartDeskLight

AI-assisted adaptive desk lighting for visual comfort — Embedded System (CEDT) Final Project 2026.

A low-voltage LED desk lamp with three servo-driven flip filters (diffuser, ND, warm/CTO) plus PWM fine-tuning. Sensors measure the light on the desk and the user's context; an LLM suggests a lighting profile and the gateway closes the loop on measured lux.

![Architecture](docs/architecture.png)

## System

| Part | Hardware | Role |
|---|---|---|
| Sensor Node (ESP32 A) | BH1750, TCS34725 | Desk lux and colour → gateway over ESP-NOW (seq + ACK/retry) |
| Gateway (ESP32 B) | VL53L0X, PIR, INA219, stop button, 3× servo, LED driver | FreeRTOS real-time control, store-and-forward, MQTTS to cloud |
| Cloud | NETPIE2020 | MQTTS :1884, Shadow, Feed (raw time series), Dashboard, Trigger |
| AI | LLM API (HTTPS) | Context → target lux / CCT / filter set |
| Alerts | Discord webhook | Node lost, sensor fault, stop pressed, gateway offline |

Embedded Engineering Depth items: **E1** FreeRTOS · **E2** interrupt-driven stop button · **E4** ACK/retry + store-and-forward · **E5** MQTTS + no secrets in repo · **E8** own I2C drivers (BH1750, INA219).

## Repository layout

```
firmware/common/       shared ESP-NOW message format (message.h)
firmware/sensor_node/  PlatformIO project — sensor node
firmware/gateway/      PlatformIO project — gateway
dashboard/             NETPIE dashboard / trigger notes
tests/                 test procedures and measured results
docs/                  diagrams and documents
```

## Build

1. Install [PlatformIO](https://platformio.org/).
2. Gateway: copy `firmware/gateway/include/secrets.example.h` to `secrets.h` and fill in Wi-Fi, NETPIE, LLM and Discord values. `secrets.h` is git-ignored — never commit it.
3. `cd firmware/gateway && pio run -t upload`, then `cd firmware/sensor_node && pio run -t upload` (set the gateway MAC in the node first).

## Team

| Member | Student ID | Role |
|---|---|---|
| TBD | | System Architect & Integration |
| TBD | | Embedded Developer (Sensor Node) |
| Narinthon Yangngam | 6833136121 | Embedded Developer (Gateway & Cloud) |
| TBD | | UI/UX & Dashboard Developer |
| TBD | | Project Manager & Test Lead |

## AI tools declaration

List the AI tools used and for which parts (required by Section 4.6), e.g. "Claude — project scaffold and proposal editing".

## Credits

Cite any third-party code, libraries or designs here.
