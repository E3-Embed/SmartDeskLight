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
%%{init: {"theme": "base", "themeVariables": {"background": "#0D1117", "primaryTextColor": "#E6EDF3", "textColor": "#C9D1D9", "lineColor": "#8B949E", "edgeLabelBackground": "#0D1117", "clusterBkg": "#161B22", "clusterBorder": "#30363D", "titleColor": "#E6EDF3"}, "flowchart": {"curve": "basis", "padding": 18, "nodeSpacing": 45, "rankSpacing": 55}}}%%
flowchart TB
  subgraph SYS["SmartDeskLight · System Architecture"]
    direction TB

    subgraph NODE["SENSOR NODE · ESP32 A"]
      S["BH1750 + TCS34725<br/>lux · colour temp"]
    end

    subgraph GW["GATEWAY · ESP32 B · FreeRTOS"]
      G1["VL53L0X · PIR · INA219"]
      G2["Control loop"]
      G3["Cloud task<br/>offline buffer"]
    end

    subgraph LAMP["LAMP"]
      L["3 servo filters<br/>+ LED PWM"]
    end

    subgraph CLOUD["CLOUD & SERVICES"]
      N[("NETPIE2020<br/>Feed · Dashboard")]
      A{{"LLM API"}}
      D["Discord"]
    end
  end

  S -->|"ESP-NOW · ACK"| G2
  G1 --> G2
  G2 -->|"servo · PWM"| L
  L -.->|"measured light"| S
  G2 <--> G3
  G3 <-->|"MQTTS"| N
  G3 <-->|"HTTPS"| A
  G3 -->|"webhook"| D

  classDef sense fill:#0F2747,stroke:#58A6FF,stroke-width:2px,color:#E6EDF3
  classDef edge fill:#3A2A0B,stroke:#F0A93B,stroke-width:2px,color:#E6EDF3
  classDef act fill:#3B1414,stroke:#FF6B6B,stroke-width:2px,color:#E6EDF3
  classDef cloud fill:#0E2E1C,stroke:#3FB950,stroke-width:2px,color:#E6EDF3
  classDef ai fill:#2A1A4A,stroke:#BC8CFF,stroke-width:2px,color:#E6EDF3
  class S sense
  class G1,G2,G3 edge
  class L act
  class N,D cloud
  class A ai

  style SYS fill:#0D1117,stroke:#30363D,stroke-width:1px,color:#E6EDF3
  style NODE fill:#161B22,stroke:#1F6FEB,stroke-width:1.5px,color:#79C0FF
  style GW fill:#161B22,stroke:#9E6A03,stroke-width:1.5px,color:#F0A93B
  style LAMP fill:#161B22,stroke:#B62324,stroke-width:1.5px,color:#FF7B72
  style CLOUD fill:#161B22,stroke:#238636,stroke-width:1.5px,color:#56D364

  linkStyle default stroke:#8B949E,stroke-width:1.5px,color:#C9D1D9
  linkStyle 3 stroke:#FF6B6B,stroke-width:2px
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
