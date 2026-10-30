# SmartDeskLight

[![Firmware build](https://github.com/E3-Embed/SmartDeskLight/actions/workflows/build.yml/badge.svg)](https://github.com/E3-Embed/SmartDeskLight/actions/workflows/build.yml)
![ESP32](https://img.shields.io/badge/MCU-ESP32-E7352C?logo=espressif&logoColor=white)
![PlatformIO](https://img.shields.io/badge/build-PlatformIO-F5822A?logo=platformio&logoColor=white)
![FreeRTOS](https://img.shields.io/badge/RTOS-FreeRTOS-4CAF50)
![NETPIE2020](https://img.shields.io/badge/cloud-NETPIE2020-16A34A)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

AI-assisted adaptive desk lighting for visual comfort — Embedded System (CEDT) Final Project 2026.

Students who switch between reading on paper and working on a screen get light on their desk that changes all day (window light, ceiling lamps, time of day). SmartDeskLight is a low-voltage LED desk lamp with **three servo-driven flip filters** (diffuser, ND, warm/CTO) plus PWM fine-tuning. Sensors measure the light that actually reaches the desk and the user's context; an LLM suggests a lighting profile, and the gateway closes the loop on the measured lux.

> Comfort aid only — not a medical device.

![System architecture](docs/architecture.png)

<sub>Editable source: [`docs/architecture.svg`](docs/architecture.svg)</sub>

## Contents

[Features](#features) · [Hardware](#hardware) · [Message formats](#message-formats) · [Firmware design](#firmware-design) · [Safety](#safety) · [Getting started](#getting-started) · [Testing](#testing) · [Milestones](#milestones) · [Team](#team) · [Contributing](#contributing)

## Features

- Measures desk illuminance (lux) and colour (RGB → CCT) at the work surface
- Three physical filters, each on its own servo (8 combinations): **Diffuser** (glare), **ND** (dimming), **Warm/CTO** (less blue light)
- LED PWM for fine brightness steps between filter combinations
- AI suggests `target_lux`, `target_cct` and a filter set per activity (Reading / Coding / Drawing) and learns from "too bright / too dim" feedback
- Presence-aware: lamp dims/turns off when nobody is at the desk
- Cloud dashboard (NETPIE2020) with raw-data history, plus Discord alerts
- Works offline: rule-based fallback and store-and-forward when Wi-Fi or the cloud is down

## Hardware

| Item | Location | Purpose | Est. cost (THB) |
|---|---|---|---|
| ESP32 DevKit ×2 (+1 for Node 2) | Node / Gateway | MCUs | 380 (+190) |
| BH1750 | Node — sensor 1 | Desk illuminance (lux), closed-loop feedback | 74–120 |
| TCS34725 | Node — sensor 2 | RGB + clear → CCT, verifies colour filter | 85–180 |
| VL53L0X | Gateway — sensor 3 | Distance lamp → user / desk | 165–320 |
| PIR (HC-SR501) | Gateway — sensor 4 | Presence at the desk | 40–100 |
| INA219 | Gateway — sensor 5 | Lamp voltage / current / power | 45–120 |
| Servo SG90 / MG90S ×3 | Gateway — actuator | Flip each filter in/out of the light path | 300–540 |
| LED module + constant-current driver (PWM) | Gateway | Light source + fine dimming (not counted as actuator) | 230–550 |
| Power supply, filter films, frame/hinges, PCB, wiring, fuse, button, spares | — | Build | 1,000–2,400 |
| **Total** | | **5 sensor types (Node 2, Gateway 3), 1 actuator type** | **≈ 2,320–4,710** |

### Pin map (ESP32 DevKit, proposed)

| Board | Signal | GPIO | Notes |
|---|---|---|---|
| Node | I²C SDA / SCL | 21 / 22 | BH1750 `0x23`, TCS34725 `0x29` |
| Gateway | I²C SDA / SCL | 21 / 22 | VL53L0X `0x29`, INA219 `0x40` |
| Gateway | PIR out | 34 | input-only pin |
| Gateway | Stop / override button | 4 | `INPUT_PULLUP`, active low, falling-edge ISR |
| Gateway | Servo 1 / 2 / 3 | 25 / 26 / 27 | LEDC 50 Hz |
| Gateway | LED driver PWM | 18 | LEDC ~5 kHz |
| Gateway | Status LED | 2 | on-board |

Power: servos on a separate 5 V ≥ 2 A rail, LED on its own DC supply through the driver, INA219 high-side on the LED rail, **all grounds common**.

## Message formats

**Node → Gateway (ESP-NOW, packed struct)** — see [`firmware/common/message.h`](firmware/common/message.h)

```
{version, type, node_id, seq, ts_ms, lux, r, g, b, c, cct}
Gateway replies ACK {version, type, node_id, seq}; no ACK in 100 ms → retry (max 3)
```

**Gateway → NETPIE2020 (MQTTS, port 1884)**

| Topic | Direction | Payload |
|---|---|---|
| `@msg/sdl/<node_id>/telemetry` | GW → cloud | raw JSON per reading |
| `@shadow/data/update` | GW → cloud | `{"data": {"n1_lux": …, "n1_cct": …, "dist_mm": …, "presence": …, "lamp_mW": …, "filters": [1,0,0], "pwm": 180, "mode": "reading"}}` |
| `@msg/sdl/cmd` | dashboard → GW | `{"mode": "coding"}` or `{"feedback": "too_bright"}` |

```json
{"node_id":"N1","seq":1024,"ts":1730300000,"lux":412.5,"cct":4300,"dist_mm":550,
 "presence":1,"lamp_mW":3120,"filters":[1,0,0],"pwm":180,"mode":"reading"}
```

**Gateway ↔ AI (HTTPS, LLM API)**

```json
// request context
{"lux":412,"cct":4300,"dist_mm":550,"presence":1,"activity":"reading",
 "filters":[1,0,0],"pwm":180,"feedback":[{"t":"21:40","v":"too_bright"}]}
// expected response
{"target_lux":450,"target_cct":4000,"filters":[1,0,1],"reason":"evening reading, user found it too bright"}
```

The gateway clamps `target_lux` to 200–750 lux, rate-limits servo moves and keeps the last good profile (or a rule-based profile) if the AI call fails.

## Firmware design

| Task (gateway) | Priority | Job |
|---|---|---|
| `ControlTask` | 4 (highest) | Safety, stop button events, closed-loop control of filters + PWM |
| `EspNowRxTask` | 3 | Drain received packets, de-duplicate by `(node_id, seq)`, per-node state |
| `SensorTask` | 2 | VL53L0X, PIR, INA219 |
| `CloudTask` | 1 | MQTTS, store-and-forward ring buffer, AI calls, Discord alerts |

Tasks communicate through FreeRTOS queues; the ESP-NOW callback and the button ISR only enqueue work.

### Embedded Engineering Depth

| Item | Plan | Status |
|---|---|---|
| E1 RTOS multitasking | 4 tasks with reasoned priorities, queues / event group | ☐ |
| E2 Interrupt-driven I/O | Stop button ISR → `xQueueSendFromISR` → ControlTask | ☐ |
| E4 Reliable communication | seq + ACK/retry node↔gateway, ring buffer when cloud is down | ☐ |
| E5 Security | MQTTS to NETPIE with CA check + device token; HTTPS to AI/Discord; secrets git-ignored | ☐ |
| E8 Low-level driver | Own I²C register-level drivers for BH1750 and INA219, checked with a logic analyzer | ☐ |

## Safety

- Low-voltage DC only — no 220 V wiring in the project
- Mechanical end stops + software angle limits + move timeout on every servo
- Stop button always wins (ISR → highest-priority task); safe state = filters folded, LED at medium
- Filter films rated for lighting use, mounted away from hot parts
- Separate servo supply sized for peak current, common ground

## Repository layout

```
firmware/common/       shared ESP-NOW message format (message.h)
firmware/sensor_node/  PlatformIO project — sensor node
firmware/gateway/      PlatformIO project — gateway (secrets.example.h → secrets.h)
dashboard/             NETPIE2020 device / dashboard / trigger setup
tests/                 test procedures and measured results
docs/                  architecture diagram (PNG + SVG source)
```

## Getting started

1. Install [PlatformIO](https://platformio.org/) (VS Code extension or CLI).
2. Create a NETPIE2020 device and follow [`dashboard/README.md`](dashboard/README.md).
3. Copy `firmware/gateway/include/secrets.example.h` → `secrets.h` and fill in Wi-Fi, NETPIE, LLM and Discord values. **Never commit `secrets.h`.**
4. Flash the gateway: `cd firmware/gateway && pio run -t upload && pio device monitor`
5. Put the gateway MAC into `GATEWAY_MAC` in the node, then flash it: `cd firmware/sensor_node && pio run -t upload`
6. Bring your own phone hotspot to demos — campus Wi-Fi often blocks ESP32.

## Testing

Planned metrics (each repeated ≥ 10×, reported as mean / min / max): BH1750 accuracy vs a reference lux meter, end-to-end latency (sensor → actuator, sensor → dashboard), node→gateway packet delivery rate, lamp power per mode, AI accuracy (recommendations accepted without change), uptime over ≥ 24 h. Failure tests: Wi-Fi loss, sensor unplugged, power loss and recovery. See [`tests/README.md`](tests/README.md).

## Milestones

| Date | Milestone | Status |
|---|---|---|
| Fri 30 Oct 2026 | Proposal | ✅ |
| Fri 20 Nov 2026 | Checkpoint video: node → gateway → cloud → dashboard | ☐ |
| Tue 8 Dec 2026 | Final presentation, demo, report, video | ☐ |

## Team

| Member | Student ID | Role | Main work |
|---|---|---|---|
| รชาทัช บุญพัฒน์ | 6833230421 | System Architect & Integration | Message format, system integration, AI integration |
| ฐากูร นันตสุวรรณ | 6833060021 | Embedded Developer (Sensor Node) | Node firmware, BH1750 driver, ESP-NOW ACK |
| นรินธร ยางงาม | 6833136121 | Embedded Developer (Gateway & Cloud) | FreeRTOS, servo/PWM, NETPIE MQTTS, INA219 |
| ปุณยวีร์ พัฒนประดิษฐ์ | 6833170421 | UI/UX & Dashboard Developer | Dashboard, feedback UI, Discord alerts |
| กษิดิศ ประจงการ | 6833008521 | Project Manager & Test Lead | Timeline, test plan, metrics, filter mechanism |

## AI tools declaration

| Tool | Used for |
|---|---|
| Claude (Anthropic) | Proposal review and editing, repository scaffold (firmware skeletons, README), architecture diagram |
| GitHub Copilot | Commit message suggestions |

Add any further tools and the parts they were used for (Section 4.6).

## Contributing

Work on a branch, open a pull request and get one review before merging. Branch names, commit message format, code style and the secrets policy are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits

Libraries: [PubSubClient](https://github.com/knolleary/pubsubclient), [ArduinoJson](https://arduinojson.org/), [ESP32Servo](https://github.com/madhephaestus/ESP32Servo), [Pololu VL53L0X](https://github.com/pololu/vl53l0x-arduino), [Adafruit TCS34725](https://github.com/adafruit/Adafruit_TCS34725). BH1750 and INA219 drivers are our own (E8).

## License

[MIT](LICENSE) © 2026 SmartDeskLight team
