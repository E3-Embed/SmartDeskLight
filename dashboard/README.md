# แดชบอร์ด SmartDeskLight

เว็บแดชบอร์ดสำหรับโคมไฟ SmartDeskLight — ดูค่าความสว่าง/อุณหภูมิสีบนโต๊ะแบบเรียลไทม์
สั่งโหมดการทำงาน และส่ง feedback กลับไปยังเกตเวย์

รันได้ทันทีด้วย **ข้อมูลจำลอง (mock)** โดยไม่ต้องมีบอร์ดหรือ broker
และเตรียมทางต่อ MQTT จริงไว้พร้อมใช้ (สลับด้วยตัวแปรเดียว)

## เริ่มใช้งาน

```bash
cd dashboard
pnpm install
pnpm dev          # http://localhost:3000
```

ค่าเริ่มต้นคือ `SOURCE=mock` — ทุกการ์ดมีข้อมูล, กราฟมีประวัติ 2 ชั่วโมงย้อนหลังให้ทันที

![แดชบอร์ดโหมดสว่าง](docs/dashboard-day.png)

![แดชบอร์ดโหมดกลางคืน](docs/dashboard-night.png)

> จอ projector 1280×720: ทุกการ์ดพอดีหนึ่งหน้าจอ (`docs/dashboard-720p.png`)

### ธีมและรูปแบบหน้าจอ

- **ธีม 4 แบบ** (สลับจาก dropdown “ธีม” บน header, จำค่าใน localStorage หรือเปิดด้วย `?theme=`):
  `studio` Studio Warm · `graphite` Warm Graphite · `nordic` Nordic Daylight · `blueprint` Blueprint Slate
- **รูปแบบ 2 แบบ** (`?layout=`): `a` Operator (3 คอลัมน์ + alert ขวา) · `b` Focus (โคมซ้าย กราฟใหญ่ขวา)
- **มุมการ์ด**: ปุ่มสี่เหลี่ยมบน header สลับ **มุมโค้ง ↔ มุมคม** (`?corners=sharp`) — ใช้กับงานนำเสนอสายเทคนิค
- **ธีม NETPIE**: `SOURCE=netpie` ใช้ MQTT `mqtt.netpie.io:8883` (อ่าน `@shadow/data/updated` + poll shadow ทุก 15 วิ) และ publish คำสั่งผ่าน REST `sdl/cmd`; ประวัติกราฟดึงจาก Feed API ผ่าน `NETPIE_FEED_METRIC`
- **ฟอนต์**: Space Grotesk (ตัวเลข/หัวข้ออังกฤษ) · Anuphan (ไทย) · JetBrains Mono (หน่วย/ค่าเล็ก)
- วัดจริงแล้วไม่มี scroll ที่ 1280×720 และ 1440×900 ทั้งสอง layout

## มีอะไรบ้าง

| ส่วน | รายละเอียด |
|---|---|
| **การ์ดความสว่าง** | ตัวเลข lux ใหญ่, เป้า ±7%, แถบ error, PWM, กำลังไฟ/แรงดัน/กระแส, ฟิลเตอร์ 3 ตัว, presence + ระยะ, แนวโน้ม 90 วินาที |
| **กราฟ** | lux vs target และ CCT vs target_cct — ช่วง 5 นาที / 30 นาที / 2 ชั่วโมง |
| **โหมด** | reading / coding / drawing → publish `{"mode":"..."}` พร้อม optimistic UI และยืนยันผลจาก `sys.mode` |
| **Feedback** | สว่างเกินไป / มืดเกินไป → `{"feedback":"..."}` (จำกัด 1 ครั้ง/5 วิ) |
| **System** | uptime, heap, RSSI, packet success (`n1_rx/n1_seq`), buffered, dropped, อายุแพ็กเก็ตโหนด |
| **แจ้งเตือน + raw** | log จาก `@msg/sdl/alert` และ drawer ดู payload จริงของ shadow/sys/telemetry |
| **safe/off** | ปุ่มถูก disable ไว้ — เฟิร์มแวร์ยังไม่รับคำสั่งนี้ (ต้องกดที่ตัวโคม) |

### Scenario จำลอง

เลือกจาก dropdown “จำลอง” บน header: `ปกติ / ไม่มีคน / เซนเซอร์หลุด / ออฟไลน์ / หยุดฉุกเฉิน / รีบูต`
ใช้ซ้อมเดโมและตรวจว่าทุก state ของ UI ถูกต้อง

## สถาปัตยกรรม

```
browser ──SSE /api/stream──▶ Next server ◀── MQTTS 8883 ──▶ broker
        ──POST /api/cmd────▶ validate ──publish──▶ @msg/sdl/cmd
                              ├─▶ ring buffer 2 h (fallback)
                              └─▶ Postgres (optional) ◀── /api/history
```

- `lib/store.ts` — state กลาง + ring buffer + fan-out ให้ทุกแท็บ
- `lib/derive.ts` — ค่าที่คำนวณได้ (error %, tolerance, state machine, packet success)
- `lib/source/mock.ts` หรือ `lib/source/mqtt.ts` — เลือกแหล่งข้อมูลด้วย `SOURCE`
- `lib/mock.ts` — ตัวจำลองวงควบคุม, presence, feedback, alert และ scenario ต่าง ๆ

### State ที่แดชบอร์ดแยกแยะ

`waiting → stale → fault → emergency → away → adjusting → steady` (เรียงตามลำดับความสำคัญ)
และ `offline` เมื่อ broker หรือ retained status บอกว่าหลุด

## การตั้งค่า (`.env.local`)

คัดลอกจาก `.env.example`:

| ตัวแปร | ค่าเริ่มต้น | ใช้ทำอะไร |
|---|---|---|
| `SOURCE` | `mock` | `mock` หรือ `mqtt` |
| `MQTT_URL` | `mqtts://gw.embed.rachatat.com:8883` | broker ของทีม |
| `MQTT_CLIENT_ID` | `sdl-dashboard` | ต้องไม่ชนกับ `sdl-gateway` |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | — | credential ของ device `dashboard` |
| `MQTT_TOPIC_PREFIX` | `@msg/sdl` | เผื่อ broker เปลี่ยน prefix |
| `DATABASE_URL` | — | ถ้าไม่ใส่ จะเก็บประวัติในหน่วยความจำอย่างเดียว |

**ห้ามใส่ credential ใน `NEXT_PUBLIC_*`** — ทั้งหมดถูกใช้ฝั่ง server เท่านั้น

## วิธีเสียบของจริง (เมื่อบอร์ดพร้อม)

1. **สร้าง user ใน EMQX** — `https://gw.embed.rachatat.com` → Access Control → Authentication → Users → Create
   username `dashboard`, password ยาว ๆ
2. **ให้สิทธิ์ (Authorization → Permissions)**:
   | Action | Topic |
   |---|---|
   | Subscribe | `@shadow/data/update` |
   | Subscribe | `@msg/sdl/#` |
   | Publish | `@msg/sdl/cmd` |
   (ห้ามให้ publish `@shadow/data/update`)
3. **เติม `.env.local`** — `SOURCE=mqtt`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_CLIENT_ID=sdl-dashboard`
4. **ทดสอบ** — `pnpm probe` ต้องเห็น `shadow`, `sys`, `status` ภายใน 40 วิ
5. **รีสตาร์ท** — `pnpm dev` แล้วเปิดหน้าเว็บ ตรวจว่าหัวมุมขึ้น “ออนไลน์” (ไม่ใช่ mock)

ถ้าใช้ `pnpm start` (production) ต้อง `pnpm build` ก่อน

### ประวัติลง Postgres (ไม่บังคับ)

```bash
docker compose up -d
# แล้วใส่ DATABASE_URL=postgres://sdl:sdl@127.0.0.1:5432/sdl ใน .env.local
```

ตาราง `samples` ถูกสร้างอัตโนมัติและลบข้อมูลเก่ากว่า 7 วันให้เอง
ถ้า DB ล่ม แดชบอร์ดยังทำงานด้วย ring buffer ในหน่วยความจำ

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|---|---|
| `pnpm dev` | dev server (Turbopack) |
| `pnpm build` / `pnpm start` | production build / serve |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | ตรวจคุณภาพ + unit test |
| `pnpm probe` | ทดสอบ broker + สิทธิ์ topic |

## แก้ปัญหาที่เจอบ่อย

| อาการ | สาเหตุ | ทางแก้ |
|---|---|---|
| `code 4 Bad username or password` | รหัสผิด/ยังไม่สร้าง user | ตรวจ Users ใน EMQX |
| `code 5 Not authorized` | ACL ไม่ผ่าน | เพิ่มสิทธิ์ตามตารางข้างบน |
| ต่อติดแต่การ์ดว่าง | ยังไม่ถึงรอบ shadow (30 วิ) หรือ gateway ออฟไลน์ | ดู `@msg/sdl/status` และ `/api/health` |
| `wss://…/mqtt` ตอบ 502 | proxy WebSocket ยังไม่เปิด | ไม่ต้องใช้ — แดชบอร์ดต่อ TCP 8883 ฝั่ง server |
| เปิด 2 แท็บแล้วหลุด | clientId ซ้ำ (เฉพาะกรณีต่อ MQTT จาก browser) | โปรเจกต์นี้ใช้ bridge ตัวเดียว จึงไม่เกิด |

## ข้อจำกัดที่ตั้งใจ

- **safe/off จากเว็บยังไม่ได้** — ต้องเพิ่มคำสั่งในเฟิร์มแวร์ก่อน
- บน EMQX ไม่มี shadow store แบบ NETPIE: `@shadow/data/update` เป็น topic ธรรมดา ไม่ retained
  หน้าใหม่จึงอาจรอถึง 30 วิ (มีตัวนับ/สถานะรอให้เห็น)
- ประวัติ alert เริ่มนับจากตอนที่ bridge เชื่อมต่อ (topic ไม่ retained)
- ค่ากำลังไฟ (Wh) ไม่ได้สะสมยอดในหน้านี้ — ดูค่ากำลังไฟ instantaneous เท่านั้น

## ภาคผนวก: การตั้งค่า NETPIE2020 (ของเดิม)

- **Project / Group:** `SmartDeskLight` / `sdl-group`
- **Device:** `gateway` สำหรับเฟิร์มแวร์เกตเวย์ (Client ID, Token และ Secret ใส่ใน `secrets.h`) และ `dashboard` สำหรับฝั่งแดชบอร์ดที่ส่งคำสั่ง
- **ฟิลด์ใน Shadow ต่อโหนด:** `n1_lux`, `n1_cct`, `n2_lux`, ... และ `dist_mm`, `presence`, `lamp_mW`, `diffuser`, `nd`, `warm`, `pwm`, `mode`
- **Feed:** เปิด datatag ของฟิลด์ใน Shadow — ตอนนี้เปิดไว้ 8 ฟิลด์: `n1_lux`, `n1_cct`, `lamp_mW`, `pwm`, `target_lux`, `dist_mm`, `presence`, `buffered`
- **Trigger:** Device Status Changed → Event Hook (แจ้งเตือนเมื่อเกตเวย์ออฟไลน์)
# การตั้งค่าแดชบอร์ด

> [!NOTE]
> แดชบอร์ดยังไม่ได้เริ่ม implement — เอกสารนี้สรุปเฉพาะสิ่งที่ฝั่งแดชบอร์ดต้องต่อกับบรอคเกอร์

- **บรอคเกอร์:** EMQX ที่รันเอง (`infra/docker-compose.yml`) เข้าถึงผ่าน NPMplus พอร์ต 8883 (TLS) หรือ wss ที่ path `/mqtt` ใช้ username / password ชุดเดียวกับเกตเวย์ (ใน `secrets.h`)
- **Subscribe:**
  - `@msg/sdl/gw/telemetry` — สถานะเกตเวย์ (Wi-Fi, MQTT, NTP, heap, uptime, reset) ทุก 2 วินาที
  - `@msg/sdl/sensor/telemetry` — heartbeat ของโหนดทุก 2 วินาที และค่าที่วัดได้เมื่อไดรเวอร์เซนเซอร์เสร็จ; แยกโหนดด้วย `node_id` (`N1`, `N2`, …)
  - `@msg/sdl/gw/state` — snapshot ทุก 30 วินาที เหมาะกับการวาดสถานะเริ่มต้นของหน้าจอ
  - `@msg/sdl/gateway/status` — `"online"` / `"offline"` แบบ retained (MQTT Last Will) ใช้แสดงสถานะลิงก์ทันทีที่ subscribe
  - `@msg/sdl/sensor/status` — retained แผนที่ presence ของโหนด `{"ts":…,"N1":"online","N2":"offline"}`; ใช้ได้เฉพาะเมื่อเกตเวย์ออนไลน์ หรือเทียบ `ts` กับเวลาปัจจุบัน
  - `@msg/sdl/alert` — ข้อความแจ้งเตือน
- **Publish:** `@msg/sdl/cmd` → `{"mode":"reading"|"coding"|"drawing"}` หรือ `{"feedback":"too_bright"|"too_dim"}`
- **ฟิลด์ใน state:** `n<id>_lux`, `n<id>_cct`, `n<id>_up_s`, `n<id>_heap`, `n<id>_temp_c`, `n<id>_sys_age_s`, `n<id>_rx`, `n<id>_seq` ต่อโหนด และ `dist_mm, presence, lamp_mW, diffuser, nd, warm, pwm, safe, mode, target_lux, ai, buffered, dropped, heap, uptime_s`
- **กราฟ/ประวัติ:** ไม่มีโควตาของ NETPIE มาคุมแล้ว — เก็บ time-series ได้ตามต้องการ (EMQX bridge, Node-RED, InfluxDB ฯลฯ)
