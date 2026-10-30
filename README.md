<div align="center">

# SmartDeskLight

**AI-assisted adaptive desk lighting for visual comfort**

ระบบปรับสภาพแสงบนโต๊ะทำงานอัตโนมัติด้วย AI เพื่อความสบายตา

[![Firmware build](https://github.com/E3-Embed/SmartDeskLight/actions/workflows/build.yml/badge.svg)](https://github.com/E3-Embed/SmartDeskLight/actions/workflows/build.yml)
![ESP32](https://img.shields.io/badge/MCU-ESP32-E7352C?logo=espressif&logoColor=white)
![PlatformIO](https://img.shields.io/badge/build-PlatformIO-F5822A?logo=platformio&logoColor=white)
![FreeRTOS](https://img.shields.io/badge/RTOS-FreeRTOS-4CAF50)
![NETPIE2020](https://img.shields.io/badge/cloud-NETPIE2020-16A34A)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Embedded System (CEDT) · Final Project 2026 · Chulalongkorn University

[Overview](#overview) · [Architecture](#architecture) · [Hardware](#hardware) · [Protocols](#communication-protocols) · [Firmware](#firmware) · [Getting started](#getting-started) · [Testing](#testing--evaluation) · [Roadmap](#roadmap) · [Team](#team)

</div>

---

## Overview

Students who switch between paper and screen work under light that keeps changing — daylight from the window, ceiling lamps, the time of day. A normal desk lamp only offers a brightness knob.

**SmartDeskLight** is a low-voltage LED desk lamp that shapes the light on the work surface with **three servo-driven flip filters** and PWM fine-tuning. It measures the light that actually reaches the desk, reads the user's context, asks an LLM for a lighting profile, and then closes the loop on measured lux.

| | |
|---|---|
| **Problem** | Desk illuminance and colour drift during the day; fixed lamps don't adapt to reading vs. screen work |
| **Target users** | University students and desk workers who alternate between documents and a computer |
| **Approach** | Sensor node on the desk → gateway with real-time control → physical filters + PWM → measured again |
| **Reference** | EN 12464-1 recommends ~500 lux for reading / writing tasks |

> [!NOTE]
> SmartDeskLight is a comfort aid, not a medical device.

### Key features

- **Physical light shaping** — Diffuser (glare), ND (dimming) and Warm/CTO (less blue) filters, each on its own servo: 8 combinations PWM alone cannot produce
- **Closed-loop control** — BH1750 + TCS34725 re-measure lux and colour temperature after every change
- **AI lighting profiles** — an LLM proposes `target_lux`, `target_cct` and a filter set per activity and learns from "too bright / too dim" feedback
- **Context aware** — presence (PIR) and distance (VL53L0X) turn the lamp down when nobody is there
- **Reliable by design** — ESP-NOW ACK/retry, store-and-forward when offline, rule-based fallback if the AI is unreachable
- **Cloud dashboard** — NETPIE2020 Feed history, live dashboard and Discord alerts

## Architecture

<p align="center">
  <img src="docs/architecture.png" alt="SmartDeskLight system architecture" width="100%">
</p>

<sub>Editable source: [`docs/architecture.svg`](docs/architecture.svg)</sub>

| Layer | Runs on | Responsibility |
|---|---|---|
| Sensor node | ESP32 A | Measure desk lux and colour, send over ESP-NOW with seq + ACK |
| Gateway | ESP32 B · FreeRTOS | Local sensing, real-time control of servos + PWM, buffering, cloud link |
| Cloud | NETPIE2020 | MQTTS broker, Shadow, Feed (raw time series), Dashboard, Trigger |
| AI | LLM API over HTTPS | Turn context into a target lighting profile |
| Alerts | Discord webhook | Node lost, sensor fault, stop pressed, gateway offline |

## Hardware

### Bill of materials

| Item | Qty | Location | Purpose | Est. cost (THB) |
|---|:-:|---|---|--:|
| ESP32 DevKit | 2 (+1) | Node / Gateway | MCUs (+1 for a second physical node) | 380 (+190) |
| BH1750 | 1 | Node | Desk illuminance (lux) — closed-loop feedback | 74–120 |
| TCS34725 | 1 | Node | RGB + clear → colour temperature | 85–180 |
| VL53L0X | 1 | Gateway | Distance lamp → user / desk | 165–320 |
| PIR (HC-SR501) | 1 | Gateway | Presence at the desk | 40–100 |
| INA219 | 1 | Gateway | Lamp voltage / current / power | 45–120 |
| Servo SG90 / MG90S | 3 | Gateway | Flip each filter in or out of the light path | 300–540 |
| LED module + constant-current driver | 1 | Gateway | Light source with PWM dimming | 230–550 |
| Supply, filter films, frame, hinges, PCB, wiring, fuse, button, spares | — | — | Build | 1,000–2,400 |
| **Total** | | | **5 sensor types · 1 actuator type** | **≈ 2,320–4,710** |

### Pin map (ESP32 DevKit)

| Board | Signal | GPIO | Notes |
|---|---|:-:|---|
| Node | I²C SDA / SCL | 21 / 22 | BH1750 `0x23`, TCS34725 `0x29` |
| Gateway | I²C SDA / SCL | 21 / 22 | VL53L0X `0x29`, INA219 `0x40` |
| Gateway | PIR output | 34 | Input-only pin |
| Gateway | Stop / override button | 4 | `INPUT_PULLUP`, active low, falling-edge ISR |
| Gateway | Servo 1 / 2 / 3 | 25 / 26 / 27 | Diffuser / ND / Warm-CTO, LEDC 50 Hz |
| Gateway | LED driver PWM | 18 | LEDC ≈ 5 kHz |
| Gateway | Status LED | 2 | On-board |

> [!IMPORTANT]
> Servos run from a separate 5 V ≥ 2 A rail, the LED from its own DC supply through the driver, and INA219 sits high-side on the LED rail. **All grounds are common.**

## Communication protocols

<details open>
<summary><b>Node → Gateway · ESP-NOW</b></summary>

Packed struct defined in [`firmware/common/message.h`](firmware/common/message.h):

```c
{ version, type, node_id, seq, ts_ms, lux, r, g, b, c, cct }
```

The gateway answers `ACK { version, type, node_id, seq }`. Without an ACK in 100 ms the node retries up to 3 times; the gateway de-duplicates by `(node_id, seq)`.

</details>

<details open>
<summary><b>Gateway ↔ NETPIE2020 · MQTTS (port 1884)</b></summary>

| Topic | Direction | Payload |
|---|---|---|
| `@msg/sdl/<node_id>/telemetry` | gateway → cloud | Raw JSON per reading |
| `@shadow/data/update` | gateway → cloud | Per-node state for Feed and Dashboard |
| `@msg/sdl/cmd` | dashboard → gateway | Activity mode or user feedback |

```json
{"node_id":"N1","seq":1024,"ts":1730300000,"lux":412.5,"cct":4300,"dist_mm":550,
 "presence":1,"lamp_mW":3120,"filters":[1,0,0],"pwm":180,"mode":"reading"}
```

</details>

<details>
<summary><b>Gateway ↔ AI · HTTPS</b></summary>

```json
// request
{"lux":412,"cct":4300,"dist_mm":550,"presence":1,"activity":"reading",
 "filters":[1,0,0],"pwm":180,"feedback":[{"t":"21:40","v":"too_bright"}]}

// response
{"target_lux":450,"target_cct":4000,"filters":[1,0,1],"reason":"evening reading, user found it too bright"}
```

The gateway clamps `target_lux` to 200–750 lux, rate-limits servo moves and keeps the last good (or rule-based) profile if the request fails.

</details>

## Firmware

### Gateway tasks (FreeRTOS)

| Task | Priority | Responsibility |
|---|:-:|---|
| `ControlTask` | 4 | Safety, stop-button events, closed-loop control of filters + PWM |
| `EspNowRxTask` | 3 | Drain received packets, de-duplicate, keep per-node state |
| `SensorTask` | 2 | VL53L0X, PIR, INA219 |
| `CloudTask` | 1 | MQTTS, store-and-forward buffer, AI requests, Discord alerts |

ISRs and the ESP-NOW callback only enqueue work; everything else happens in tasks.

### Embedded Engineering Depth

| Item | Implementation | Status |
|---|---|:-:|
| **E1** RTOS multitasking | Four tasks with reasoned priorities, queues and event groups | 🟡 scaffolded |
| **E2** Interrupt-driven I/O | Stop button ISR → `xQueueSendFromISR` → `ControlTask` | 🟡 scaffolded |
| **E4** Reliable communication | seq + ACK/retry node ↔ gateway, ring buffer while offline | 🟡 scaffolded |
| **E5** Security | MQTTS with CA check + device token, HTTPS to AI/Discord, secrets git-ignored | ⚪ planned |
| **E8** Low-level driver | Own register-level I²C drivers for BH1750, TCS34725 and INA219 | ⚪ planned |

### Safety

- Low-voltage DC only — no mains wiring in the project
- Mechanical end stops, software angle limits and a timeout on every servo move
- Stop button always wins; safe state = filters folded, LED at medium
- Filter films rated for lighting use, mounted away from hot parts

## Getting started

### Prerequisites

- [PlatformIO](https://platformio.org/) (VS Code extension or CLI)
- Two ESP32 DevKit boards and the parts in the [BOM](#bill-of-materials)
- A NETPIE2020 account and device (see [`dashboard/README.md`](dashboard/README.md))

### Build and flash

```bash
git clone https://github.com/E3-Embed/SmartDeskLight.git
cd SmartDeskLight

# 1. Secrets (never committed)
cp firmware/gateway/include/secrets.example.h firmware/gateway/include/secrets.h
#    → fill in Wi-Fi, NETPIE Client ID / Token, LLM API key, Discord webhook

# 2. Gateway
pio run -d firmware/gateway -t upload
pio device monitor -b 115200     # note the gateway MAC address

# 3. Sensor node (set GATEWAY_MAC in src/main.cpp first)
pio run -d firmware/sensor_node -t upload
```

> [!TIP]
> Bring a phone hotspot to demos — campus Wi-Fi often blocks ESP32 boards.

### Repository structure

```
SmartDeskLight/
├── firmware/
│   ├── common/          # shared ESP-NOW message format
│   ├── sensor_node/     # PlatformIO project — ESP32 A
│   └── gateway/         # PlatformIO project — ESP32 B (secrets.example.h)
├── dashboard/           # NETPIE2020 device, dashboard and trigger setup
├── tests/               # test procedures and measured results
├── docs/                # architecture diagram (PNG + SVG source)
└── .github/             # CI workflow, issue and PR templates
```

## Testing & evaluation

Every metric is repeated at least 10 times and reported as mean / min / max. Details and results live in [`tests/README.md`](tests/README.md).

| Metric | Method |
|---|---|
| Sensor accuracy | BH1750 vs. reference lux meter at 5 light levels |
| End-to-end latency | sensor → actuator and sensor → dashboard, from timestamps |
| Packet delivery rate | node `seq` vs. packets received at the gateway |
| Power | INA219 readings per lighting mode |
| AI accuracy | share of recommendations accepted without change |
| Uptime | continuous run ≥ 24 h |

Failure tests cover Wi-Fi loss, an unplugged sensor, power loss with automatic recovery, and a lost node triggering an alert.

## Roadmap

- [x] **30 Oct 2026** — Proposal, architecture, repository scaffold, CI
- [ ] **20 Nov 2026** — Checkpoint video: node → gateway → cloud → dashboard end to end
- [ ] Filter mechanism, closed-loop control and AI profile in the loop
- [ ] Own BH1750 / INA219 drivers, MQTTS, store-and-forward
- [ ] 24 h field test with real users, metrics collected
- [ ] **8 Dec 2026** — Final presentation, live demo, report and video

## Team

| Member | Student ID | Role | Main responsibilities |
|---|---|---|---|
| รชาทัช บุญพัฒน์ | 6833230421 | System Architect & Integration | Message format, system integration, AI integration |
| ฐากูร นันตสุวรรณ | 6833060021 | Embedded Developer — Sensor Node | Node firmware, BH1750 driver, ESP-NOW ACK |
| นรินธร ยางงาม | 6833136121 | Embedded Developer — Gateway & Cloud | FreeRTOS, servo/PWM, NETPIE MQTTS, INA219 |
| ปุณยวีร์ พัฒนประดิษฐ์ | 6833170421 | UI/UX & Dashboard Developer | Dashboard, feedback UI, Discord alerts |
| กษิดิศ ประจงการ | 6833008521 | Project Manager & Test Lead | Timeline, test plan, metrics, filter mechanism |

## Contributing

Work on a branch, open a pull request and get one review before merging. Branch naming, commit messages, code style and the secrets policy are described in [CONTRIBUTING.md](CONTRIBUTING.md).

## AI tools declaration

As required by Section 4.6 of the course brief:

| Tool | Used for |
|---|---|
| Claude (Anthropic) | Proposal review and editing, repository scaffold, README, architecture diagram, CI setup |
| GitHub Copilot | Commit message suggestions |

## Acknowledgements

[PubSubClient](https://github.com/knolleary/pubsubclient) · [ArduinoJson](https://arduinojson.org/) · [ESP32Servo](https://github.com/madhephaestus/ESP32Servo) · [Pololu VL53L0X](https://github.com/pololu/vl53l0x-arduino) · [NETPIE2020](https://netpie.io)

## License

Released under the [MIT License](LICENSE) © 2026 SmartDeskLight team.
