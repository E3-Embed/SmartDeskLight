<div align="center">

# 💡 SmartDeskLight

### Light that adapts to how you work

An AI-assisted desk lamp that shapes light with servo-driven filters<br>and closes the loop on the lux that actually reaches your desk.

<sub>โคมไฟโต๊ะอัจฉริยะ ปรับสภาพแสงอัตโนมัติด้วย AI เพื่อความสบายตา</sub>

<br>

[![Firmware build](https://github.com/E3-Embed/SmartDeskLight/actions/workflows/build.yml/badge.svg)](https://github.com/E3-Embed/SmartDeskLight/actions/workflows/build.yml)
![ESP32](https://img.shields.io/badge/ESP32-FreeRTOS-E7352C?logo=espressif&logoColor=white)
![NETPIE2020](https://img.shields.io/badge/cloud-NETPIE2020-16A34A)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**[Architecture](#architecture)** · **[How it works](#how-it-works)** · **[Quick start](#quick-start)** · **[Docs](#documentation)** · **[Team](#team)**

</div>

<br>

## Architecture

```mermaid
flowchart TB
  subgraph NODE["Sensor Node · ESP32 A"]
    S["BH1750 + TCS34725<br/><small>desk lux · colour temp</small>"]
  end

  subgraph GW["Gateway · ESP32 B · FreeRTOS"]
    G1["VL53L0X · PIR · INA219<br/><small>distance · presence · power</small>"]
    G2["Control loop<br/><small>target vs measured</small>"]
    G3["Cloud task<br/><small>store-and-forward</small>"]
  end

  subgraph LAMP["Lamp"]
    L["3× servo filters + LED PWM<br/><small>diffuser · ND · warm</small>"]
  end

  subgraph CLOUD["Cloud & Services"]
    N[("NETPIE2020<br/><small>Shadow · Feed · Dashboard</small>")]
    A{{"LLM API"}}
    D["Discord"]
  end

  S -->|"ESP-NOW · ACK"| G2
  G1 --> G2
  G2 -->|"servo · PWM"| L
  L -.->|"measured light"| S
  G2 <--> G3
  G3 <-->|"MQTTS"| N
  G3 <-->|"HTTPS"| A
  G3 -->|"webhook"| D

  classDef sense fill:#E8F1FB,stroke:#2F6FEB,stroke-width:1.5px,color:#0F172A
  classDef edge fill:#FFF3D6,stroke:#D97706,stroke-width:1.5px,color:#0F172A
  classDef act fill:#FDE2E2,stroke:#DC2626,stroke-width:1.5px,color:#0F172A
  classDef cloud fill:#DCFCE7,stroke:#16A34A,stroke-width:1.5px,color:#0F172A
  classDef ai fill:#EDE4FD,stroke:#7C3AED,stroke-width:1.5px,color:#0F172A
  class S sense
  class G1,G2,G3 edge
  class L act
  class N,D cloud
  class A ai
  style NODE fill:#F5F8FF,stroke:#BFD3FB,color:#1E3A8A
  style GW fill:#FFFAF0,stroke:#F5D199,color:#7C2D12
  style LAMP fill:#FFF5F5,stroke:#F8B4B4,color:#7F1D1D
  style CLOUD fill:#F2FBF5,stroke:#A7E3BC,color:#14532D
  linkStyle 3 stroke:#DC2626,stroke-width:2px
```

<sub>Detailed diagram with FreeRTOS tasks and E-items: [`docs/architecture.png`](docs/architecture.png)</sub>

## Highlights

- **Shapes light, not just brightness** — diffuser, ND and warm/CTO filters flip in and out on three servos
- **Closed loop** — every change is re-measured on the desk (BH1750 lux, TCS34725 colour)
- **Learns your preference** — an LLM suggests a profile per activity and adapts to *too bright / too dim* feedback
- **Built to keep working** — ESP-NOW with ACK/retry, store-and-forward offline, rule-based fallback

## How it works

| | Step | What happens |
|:-:|---|---|
| 1 | **Sense** | The sensor node measures desk lux and colour; the gateway reads presence, distance and lamp power |
| 2 | **Decide** | The gateway sends context to the AI and receives a target lux, colour temperature and filter set |
| 3 | **Act** | FreeRTOS control task moves the filter servos and trims the LED with PWM |
| 4 | **Verify** | The new light is measured again and the loop corrects any error |

## Quick start

```bash
git clone https://github.com/E3-Embed/SmartDeskLight.git && cd SmartDeskLight
cp firmware/gateway/include/secrets.example.h firmware/gateway/include/secrets.h   # add your keys
pio run -d firmware/gateway -t upload
pio run -d firmware/sensor_node -t upload
```

Requires [PlatformIO](https://platformio.org/), two ESP32 boards and a NETPIE2020 device — see the docs below.

## Documentation

| | |
|---|---|
| [Hardware](docs/hardware.md) | Bill of materials, pin map, power and safety |
| [Protocols](docs/protocols.md) | ESP-NOW packet, NETPIE topics, AI request / response |
| [Firmware](docs/firmware.md) | FreeRTOS tasks and Embedded Engineering Depth items |
| [Testing](docs/testing.md) | Metrics, method and results |
| [Dashboard](dashboard/README.md) | NETPIE2020 device, dashboard and alerts setup |
| [Contributing](CONTRIBUTING.md) | Branches, commit style, secrets policy |

## Team

| Member | Role |
|---|---|
| **รชาทัช บุญพัฒน์** · 6833230421 | System Architect & Integration |
| **ฐากูร นันตสุวรรณ** · 6833060021 | Embedded Developer — Sensor Node |
| **นรินธร ยางงาม** · 6833136121 | Embedded Developer — Gateway & Cloud |
| **ปุณยวีร์ พัฒนประดิษฐ์** · 6833170421 | UI/UX & Dashboard Developer |
| **กษิดิศ ประจงการ** · 6833008521 | Project Manager & Test Lead |

## Status

- [x] Proposal, architecture and CI — *30 Oct 2026*
- [ ] End-to-end data flow: node → gateway → cloud → dashboard — *20 Nov 2026*
- [ ] Final demo, report and video — *8 Dec 2026*

<br>

<div align="center">
<sub>Embedded System (CEDT) Final Project 2026 · Chulalongkorn University<br>
AI tools used: Claude (proposal editing, repo scaffold, docs, diagram), GitHub Copilot (commit messages) · <a href="LICENSE">MIT License</a></sub>
</div>
