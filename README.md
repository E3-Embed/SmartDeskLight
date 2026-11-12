<div align="center">

# 💡 SmartDeskLight

### โคมไฟโต๊ะอัจฉริยะ ปรับแสงตามการทำงานของคุณ

โคมไฟโต๊ะที่มี AI ช่วยเลือกสภาพแสง ปรับลักษณะแสงด้วยฟิลเตอร์ที่ขับด้วยเซอร์โว<br>และควบคุมแบบวงปิดจากค่าความสว่าง (lux) ที่ตกถึงโต๊ะจริง

<br>

[![บิลด์เฟิร์มแวร์](https://github.com/E3-Embed/SmartDeskLight/actions/workflows/build.yml/badge.svg)](https://github.com/E3-Embed/SmartDeskLight/actions/workflows/build.yml)
![ESP32](https://img.shields.io/badge/ESP32-FreeRTOS-E7352C?logo=espressif&logoColor=white)
![NETPIE2020](https://img.shields.io/badge/cloud-NETPIE2020-16A34A)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**[สถาปัตยกรรม](#สถาปัตยกรรม)** · **[ลำดับการทำงาน](#ลำดับการทำงาน)** · **[หลักการทำงาน](#หลักการทำงาน)** · **[เริ่มต้นใช้งาน](#เริ่มต้นใช้งาน)** · **[เอกสาร](#เอกสาร)** · **[ทีม](#ทีม)**

</div>

<br>

## สถาปัตยกรรม

```mermaid
%%{init: {"theme": "base", "themeVariables": {"background": "#0D1117", "primaryTextColor": "#E6EDF3", "textColor": "#C9D1D9", "lineColor": "#8B949E", "edgeLabelBackground": "#0D1117", "clusterBkg": "#161B22", "clusterBorder": "#30363D", "titleColor": "#E6EDF3"}, "flowchart": {"curve": "basis", "padding": 18, "nodeSpacing": 45, "rankSpacing": 55}}}%%
flowchart TB
  subgraph SYS["SmartDeskLight · สถาปัตยกรรมระบบ"]
    direction TB

    subgraph NODE["โหนดเซนเซอร์ · ESP32 A"]
      S["BH1750 + TCS34725<br/>ความสว่าง · อุณหภูมิสี"]
    end

    subgraph GW["เกตเวย์ · ESP32 B · FreeRTOS"]
      G1["VL53L0X · PIR · INA219"]
      G2["ลูปควบคุม"]
      G3["งานคลาวด์<br/>บัฟเฟอร์ออฟไลน์"]
    end

    subgraph LAMP["โคมไฟ"]
      L["ฟิลเตอร์เซอร์โว 3 ชุด<br/>+ LED PWM"]
    end

    subgraph CLOUD["คลาวด์และบริการ"]
      N[("NETPIE2020<br/>Feed · Dashboard")]
      A{{"LLM API"}}
      D["Discord"]
    end
  end

  S -->|"ESP-NOW · ACK"| G2
  G1 --> G2
  G2 -->|"เซอร์โว · PWM"| L
  L -.->|"แสงที่วัดได้"| S
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

<sub>ไดอะแกรมแบบละเอียดพร้อมงาน FreeRTOS และหัวข้อ E: [`docs/architecture.png`](docs/architecture.png)</sub>

## ลำดับการทำงาน

การทำงานหนึ่งรอบของระบบ ตั้งแต่การวัดค่าจนถึงแสงบนโต๊ะที่ตรวจสอบแล้ว:

```mermaid
%%{init: {"theme": "base", "themeVariables": {"background": "#0D1117", "actorBkg": "#161B22", "actorBorder": "#58A6FF", "actorTextColor": "#E6EDF3", "actorLineColor": "#30363D", "signalColor": "#8B949E", "signalTextColor": "#E6EDF3", "labelBoxBkgColor": "#161B22", "labelBoxBorderColor": "#30363D", "labelTextColor": "#E6EDF3", "loopTextColor": "#C9D1D9", "noteBkgColor": "#1F2A37", "noteBorderColor": "#30363D", "noteTextColor": "#C9D1D9", "activationBkgColor": "#3A2A0B", "activationBorderColor": "#F0A93B", "sequenceNumberColor": "#0D1117"}, "sequence": {"mirrorActors": false, "boxMargin": 8, "messageMargin": 38, "noteMargin": 10}}}%%
sequenceDiagram
  autonumber
  actor U as ผู้ใช้
  participant N as โหนดเซนเซอร์
  participant G as เกตเวย์
  participant L as โคมไฟ
  participant A as LLM API
  participant P as NETPIE2020

  rect rgb(18, 23, 30)
    Note over N,G: ตรวจวัด — ทุกวินาที
    N->>G: Telemetry { node_id, seq, lux, cct }
    G-->>N: ACK { seq }
    opt ไม่ได้รับ ACK ภายใน 100 ms
      N->>G: ส่งซ้ำ (สูงสุด 3 ครั้ง)
    end
    G->>P: MQTTS publish (ข้อมูลดิบ + shadow)
  end

  rect rgb(22, 27, 34)
    Note over U,P: ตัดสินใจ — เมื่อเปลี่ยนกิจกรรม มี feedback หรือทุก 5 นาที
    U->>P: เลือกกิจกรรม / "สว่างเกินไป"
    P->>G: @msg/sdl/cmd
    activate G
    G->>A: HTTPS ส่งบริบท (lux, cct, presence, feedback)
    A-->>G: { target_lux, target_cct, filters[3] }
    G->>G: จำกัดช่วงค่า และจำกัดความถี่การขยับเซอร์โว
    deactivate G
  end

  rect rgb(18, 23, 30)
    Note over N,L: สั่งงานและตรวจสอบ — วงปิด
    G->>L: มุมเซอร์โว + PWM
    L-->>N: แสงที่ตกบนโต๊ะ
    N->>G: ค่า lux ใหม่
    alt ค่าคลาดเคลื่อนอยู่ในเกณฑ์
      G->>G: คงค่าเดิม
    else ยังไม่ถึงค่าเป้าหมาย
      G->>L: ปรับ PWM อย่างละเอียด
    end
  end

  rect rgb(22, 27, 34)
    Note over G,P: การรับมือเมื่อเกิดปัญหา
    alt เชื่อมต่อคลาวด์ไม่ได้
      G->>G: เก็บข้อมูลในบัฟเฟอร์ แล้วส่งต่อเมื่อเชื่อมต่อได้
    else กดปุ่มหยุด หรือเซนเซอร์ขัดข้อง
      G->>L: สถานะปลอดภัย (พับฟิลเตอร์ออก, LED ระดับกลาง)
      G->>P: แจ้งเตือน → Discord
    end
  end
```

## จุดเด่น

- **ปรับลักษณะแสง ไม่ใช่แค่ความสว่าง** — ฟิลเตอร์ diffuser, ND และ warm/CTO พับเข้า-ออกด้วยเซอร์โว 3 ตัว
- **ควบคุมแบบวงปิด** — ทุกการเปลี่ยนแปลงถูกวัดซ้ำบนโต๊ะ (BH1750 วัด lux, TCS34725 วัดสี)
- **เรียนรู้ความชอบของผู้ใช้** — LLM เสนอโปรไฟล์แสงตามกิจกรรม และปรับตาม feedback *สว่างเกินไป / มืดเกินไป*
- **ออกแบบให้ทำงานต่อได้เสมอ** — ESP-NOW พร้อม ACK/ส่งซ้ำ, เก็บข้อมูลไว้ส่งทีหลังเมื่อออฟไลน์, มีโปรไฟล์ตามกฎสำรองเมื่อ AI ใช้ไม่ได้

## หลักการทำงาน

| | ขั้นตอน | สิ่งที่เกิดขึ้น |
|:-:|---|---|
| 1 | **ตรวจวัด** | โหนดเซนเซอร์วัดความสว่างและสีบนโต๊ะ ส่วนเกตเวย์อ่านค่าการมีคนอยู่ ระยะห่าง และกำลังไฟของโคม |
| 2 | **ตัดสินใจ** | เกตเวย์ส่งบริบทให้ AI แล้วได้ค่าเป้าหมาย lux อุณหภูมิสี และชุดฟิลเตอร์กลับมา |
| 3 | **สั่งงาน** | งานควบคุมใน FreeRTOS ขยับเซอร์โวฟิลเตอร์และปรับ LED ด้วย PWM |
| 4 | **ตรวจสอบ** | วัดแสงใหม่อีกครั้ง แล้วลูปควบคุมแก้ค่าคลาดเคลื่อนที่เหลือ |

## เริ่มต้นใช้งาน

```bash
git clone https://github.com/E3-Embed/SmartDeskLight.git && cd SmartDeskLight
cp firmware/gateway/include/secrets.example.h firmware/gateway/include/secrets.h   # ใส่คีย์ของคุณ
pio run -d firmware/gateway -t upload
pio run -d firmware/sensor_node -t upload
```

ต้องมี [PlatformIO](https://platformio.org/), บอร์ด ESP32 สองบอร์ด และ device บน NETPIE2020 — ดูรายละเอียดในเอกสารด้านล่าง

## เอกสาร

| เอกสาร | เนื้อหา |
|---|---|
| [ฮาร์ดแวร์](docs/hardware.md) | รายการอุปกรณ์ ผังขา ไฟเลี้ยง และความปลอดภัย |
| [โปรโตคอล](docs/protocols.md) | แพ็กเก็ต ESP-NOW, topic ของ NETPIE, คำขอและคำตอบของ AI |
| [เฟิร์มแวร์](docs/firmware.md) | งาน FreeRTOS และหัวข้อ Embedded Engineering Depth |
| [การทดสอบ](docs/testing.md) | ตัวชี้วัด วิธีทดสอบ และผลลัพธ์ |
| [แดชบอร์ด](dashboard/README.md) | การตั้งค่า device, dashboard และการแจ้งเตือนบน NETPIE2020 |
| [แนวทางการร่วมพัฒนา](CONTRIBUTING.md) | การตั้งชื่อ branch รูปแบบ commit และนโยบายข้อมูลลับ |

## ทีม

| สมาชิก | บทบาท |
|---|---|
| **รชาทัช บุญพัฒน์** · 6833230421 | สถาปนิกระบบและผู้รวมระบบ |
| **ฐากูร นันตสุวรรณ** · 6833060021 | นักพัฒนาระบบฝังตัว — โหนดเซนเซอร์ |
| **นรินธร ยางงาม** · 6833136121 | นักพัฒนาระบบฝังตัว — เกตเวย์และคลาวด์ |
| **ปุณยวีร์ พัฒนประดิษฐ์** · 6833170421 | นักพัฒนา UI/UX และแดชบอร์ด |
| **กษิดิศ ประจงการ** · 6833008521 | ผู้จัดการโครงการและหัวหน้าฝ่ายทดสอบ |

## สถานะ

- [x] ข้อเสนอโครงงาน สถาปัตยกรรม และ CI — *30 ต.ค. 2026*
- [ ] ข้อมูลไหลครบวงจร: โหนด → เกตเวย์ → คลาวด์ → แดชบอร์ด — *20 พ.ย. 2026*
- [ ] เดโมรอบสุดท้าย รายงาน และวิดีโอ — *8 ธ.ค. 2026*

<br>

<div align="center">
<sub>โครงงานรายวิชา Embedded System (CEDT) ปี 2026 · จุฬาลงกรณ์มหาวิทยาลัย<br>
เครื่องมือ AI ที่ใช้: Claude (แก้ไขข้อเสนอโครงงาน, โครงสร้าง repo, เอกสาร, ไดอะแกรม), GitHub Copilot (ข้อความ commit) · <a href="LICENSE">สัญญาอนุญาต MIT</a></sub>
</div>
