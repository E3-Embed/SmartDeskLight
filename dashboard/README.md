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
| **กราฟ** | lux vs target และ CCT vs target_cct — ช่วง 5 นาที (ข้อมูลสด) / 30 นาที / 2 ชั่วโมง (อ่านจาก Postgres) |
| **โหมด** | reading / coding / drawing → publish `{"mode":"..."}` พร้อม optimistic UI และยืนยันผลจาก `gw/state.mode` |
| **Feedback** | สว่างเกินไป / มืดเกินไป → `{"feedback":"..."}` (จำกัด 1 ครั้ง/5 วิ) |
| **System** | uptime, heap, RSSI จาก `gw/telemetry`; packet success (`tx_acked/tx_attempts`) จาก `sensor/health`; buffered, dropped, อายุแพ็กเก็ตโหนดจาก `gw/state` |
| **แจ้งเตือน + raw** | log จาก `@msg/sdl/alert` และ drawer ดู payload จริงของ state / gateway / telemetry (พร้อมค่า RGB ดิบ) / health / presence |
| **safe/off** | ปุ่มถูก disable ไว้ — เฟิร์มแวร์ยังไม่รับคำสั่งนี้ (ต้องกดที่ตัวโคม) |

### Scenario จำลอง

เลือกจาก dropdown “จำลอง” บน header: `ปกติ / ไม่มีคน / เซนเซอร์หลุด / ออฟไลน์ / หยุดฉุกเฉิน / รีบูต`
ใช้ซ้อมเดโมและตรวจว่าทุก state ของ UI ถูกต้อง

## สถาปัตยกรรม

```
browser ──SSE /api/stream──▶ Next server ◀── MQTTS 8883 ──▶ broker
        ──POST /api/cmd────▶ validate ──publish──▶ @msg/sdl/cmd
                              ├─▶ ring buffer 2 h (fallback)
                              └── /api/history ──read-only──▶ Postgres (EMQX เขียน)
```

- `lib/store.ts` — state กลาง + ring buffer + fan-out ให้ทุกแท็บ
- `lib/topics.ts` — topic map ชุดเดียวกับ `firmware/gateway/src/config.h`
- `lib/derive.ts` — ค่าที่คำนวณได้ (error %, tolerance, state machine, packet success)
- `lib/source/mqtt.ts` — bridge MQTT ตัวเดียว (subscribe `@msg/sdl/#`)
- `lib/db.ts` — อ่าน `public.sdl_sensor_telemetry` เท่านั้น ไม่มี writer
- `lib/mock.ts` — ตัวจำลองวงควบคุม, presence, feedback, alert และ scenario ต่าง ๆ

### State ที่แดชบอร์ดแยกแยะ

`waiting → stale → fault → emergency → away → adjusting → steady` (เรียงตามลำดับความสำคัญ)
และ `offline` เมื่อ broker หรือ retained status บอกว่าหลุด

## การตั้งค่า (`.env.local`)

คัดลอกจาก `.env.example`:

| ตัวแปร | ค่าเริ่มต้น | ใช้ทำอะไร |
|---|---|---|
| `SOURCE` | `mock` | `mock`, `mqtt` หรือ `netpie` (ของเก่า) |
| `MQTT_URL` | `mqtts://gw.embed.rachatat.com:8883` | broker ของทีม — ใช้ชื่อนี้เพราะใบรับรองครอบ `*.embed.rachatat.com` |
| `MQTT_CLIENT_ID` | `sdl-dashboard` | ต้องไม่ชนกับ `sdl-gateway` |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | — | credential ของ device `dashboard` |
| `MQTT_TOPIC_PREFIX` | `@msg/sdl` | เผื่อ broker เปลี่ยน prefix |
| `SDL_NODE_ID` | `N1` | โหนดที่แดชบอร์ดวาด (telemetry ของโหนดอื่นถูกข้าม) |
| `MQTT_TLS_INSECURE` | — | ใส่ `1` เฉพาะ broker ที่ใช้ self-signed cert |
| `DATABASE_URL` | — | Postgres ที่ EMQX เขียนประวัติ; ถ้าไม่ใส่/ต่อไม่ได้ จะใช้ ring buffer |
| `DATABASE_SSL` | — | ใส่ `require` เมื่อเซิร์ฟเวอร์บังคับ TLS |

**ห้ามใส่ credential ใน `NEXT_PUBLIC_*`** — ทั้งหมดถูกใช้ฝั่ง server เท่านั้น

## วิธีเสียบของจริง (เมื่อบอร์ดพร้อม)

1. **สร้าง user ใน EMQX** — `https://gw.embed.rachatat.com` → Access Control → Authentication → Users → Create
   username `dashboard`, password ยาว ๆ
2. **ให้สิทธิ์ (Authorization → Permissions)**:
   | Action | Topic |
   |---|---|
   | Subscribe | `@msg/sdl/#` |
   | Publish | `@msg/sdl/cmd` |
   (ไม่ต้องให้สิทธิ์ `@shadow/data/update` อีก)
3. **เติม `.env.local`** — `SOURCE=mqtt`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_CLIENT_ID=sdl-dashboard`
4. **ทดสอบ** — `pnpm probe` ต้องเห็น ✓ ครบ 6 topic: `gw/status`, `sensor/status`, `gw/telemetry`, `sensor/telemetry`, `sensor/health`, `gw/state`
5. **รีสตาร์ท** — `pnpm dev` แล้วเปิดหน้าเว็บ ตรวจว่าหัวมุมขึ้น “ออนไลน์” (ไม่ใช่ mock)

ถ้าใช้ `pnpm start` (production) ต้อง `pnpm build` ก่อน

### ประวัติใน Postgres (อ่านอย่างเดียว)

แดชบอร์ด **ไม่เขียน** DB เอง — EMQX PostgreSQL connector เป็นเจ้าของตาราง
`public.sdl_sensor_telemetry` (คอลัมน์ `msgid, qos, arrived, node_id, seq, ts, node_ms, lux, r, g, b, c, cct`)

```bash
# ใน .env.local
DATABASE_URL=postgres://iot:<password>@85.211.247.199.nip.io:5555/iot
```

- `/api/history?range=30m|2h` อ่านตารางนี้ (index ที่แนะนำ: `(node_id, ts DESC)`)
- ตารางมีแค่ `lux`/`cct` → กราฟย้อนหลังจึงไม่มีเส้นเป้าหมาย/PWM (ช่วง 5 นาทีใช้ข้อมูลสดจึงมีครบ)
- ถ้า DB ต่อไม่ได้ แดชบอร์ดยังทำงานด้วย ring buffer 2 ชั่วโมง และขึ้นป้าย “memory · DB ไม่ตอบสนอง” บนกราฟ

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
| TLS error `Hostname/IP does not match certificate` | ต่อด้วย IP หรือ `*.nip.io` แต่ cert ออกให้ `*.embed.rachatat.com` | ใช้ `MQTT_URL=mqtts://gw.embed.rachatat.com:8883` |
| ต่อติดแต่การ์ดว่าง | ยังไม่ถึงรอบ `gw/state` (~10 วิ) หรือ gateway ออฟไลน์ | ดู `@msg/sdl/gw/status` และ `/api/health` |
| กราฟ 30 นาที/2 ชั่วโมงว่าง + ป้าย memory | ต่อ Postgres ไม่ได้ | ตรวจ `DATABASE_URL` / firewall ของพอร์ต 5555 (ดู `db.lastError` ใน `/api/health`) |
| `wss://…/mqtt` ตอบ 502 | proxy WebSocket ยังไม่เปิด | ไม่ต้องใช้ — แดชบอร์ดต่อ TCP 8883 ฝั่ง server |
| เปิด 2 แท็บแล้วหลุด | clientId ซ้ำ (เฉพาะกรณีต่อ MQTT จาก browser) | โปรเจกต์นี้ใช้ bridge ตัวเดียว จึงไม่เกิด |

## ข้อจำกัดที่ตั้งใจ

- **safe/off จากเว็บยังไม่ได้** — ต้องเพิ่มคำสั่งในเฟิร์มแวร์ก่อน
- `@msg/sdl/gw/state` ไม่ retained — หน้าใหม่รอได้ถึง ~10 วิ (มีสถานะ “รอข้อมูล” ให้เห็น)
  ข้อยกเว้นคือ `gw/status` กับ `sensor/status` ที่ retained จึงได้ค่าทันที
- `sensor/status` บอกแค่ว่าโหนดยังมีชีวิต ไม่ได้แปลว่ามีค่า lux ใหม่ — ต้องดู `n1_age_s` ใน `gw/state` อีกชั้น
- ประวัติ alert เริ่มนับจากตอนที่ bridge เชื่อมต่อ (topic ไม่ retained)
- ค่ากำลังไฟ (Wh) ไม่ได้สะสมยอดในหน้านี้ — ดูค่ากำลังไฟ instantaneous เท่านั้น
- retained message เก่าที่ `@msg/sdl/status` และ `@msg/sdl/gateway/status` (“offline”) ยังค้างใน EMQX
  แดชบอร์ดไม่สนใจแล้ว แต่ควรลบใน EMQX Dashboard → MQTT → Retained

## ภาคผนวก: การตั้งค่า NETPIE2020 (ของเดิม)

- **Project / Group:** `SmartDeskLight` / `sdl-group`
- **Device:** `gateway` สำหรับเฟิร์มแวร์เกตเวย์ (Client ID, Token และ Secret ใส่ใน `secrets.h`) และ `dashboard` สำหรับฝั่งแดชบอร์ดที่ส่งคำสั่ง
- **ฟิลด์ใน Shadow ต่อโหนด:** `n1_lux`, `n1_cct`, `n2_lux`, ... และ `dist_mm`, `presence`, `lamp_mW`, `diffuser`, `nd`, `warm`, `pwm`, `mode`
- **Feed:** เปิด datatag ของฟิลด์ใน Shadow — ตอนนี้เปิดไว้ 8 ฟิลด์: `n1_lux`, `n1_cct`, `lamp_mW`, `pwm`, `target_lux`, `dist_mm`, `presence`, `buffered`
- **Trigger:** Device Status Changed → Event Hook (แจ้งเตือนเมื่อเกตเวย์ออฟไลน์)
## ภาคผนวก: topic map ที่แดชบอร์ดใช้จริง

ตรวจสดด้วย `pnpm probe` (ณ 18 พ.ย. 2026 broker ตอบครบทั้ง 6 topic)

| Topic | ทิศทาง | ความถี่ | ข้อมูล |
|---|---|---|---|
| `@msg/sdl/gw/state` | gw → cloud | ~10 s | snapshot โคม + ค่าล่าสุดของโหนด (flat JSON) |
| `@msg/sdl/gw/telemetry` | gw → cloud | 2 s | Wi-Fi, heap, uptime, NTP, reset |
| `@msg/sdl/gw/status` | gw → cloud | retained | `"online"` / `"offline"` (Last Will) |
| `@msg/sdl/sensor/telemetry` | gw → cloud | ~1 s | `node_id, seq, ts, lux, r, g, b, c, cct` (`ts` = epoch วินาที, `cct=0` = อ่านสีไม่ได้) |
| `@msg/sdl/sensor/health` | gw → cloud | 2 s | `uptime_s, heap, heap_min, temp_c, reset, tx_acked, tx_attempts` |
| `@msg/sdl/sensor/status` | gw → cloud | retained, refresh 30 s | presence map `{"ts":…,"N1":"online"}` |
| `@msg/sdl/cmd` | dashboard → gw | ตามคำสั่ง | `{"mode":"…"}` / `{"feedback":"…"}` |
| `@msg/sdl/alert` | gw → cloud | event | ข้อความ plain text |

- ทุก topic อยู่ใต้ `@msg/sdl/#` — subscribe ครั้งเดียวพอ
- `cct` ที่เป็น 0 จะถูกตัดทิ้งตั้งแต่ `lib/parse.ts` เพื่อไม่ให้กราฟลากลงไป 0 K
- เฟิร์มแวร์ปัจจุบันยังไม่ใส่ `ts` ใน `gw/state` — แดชบอร์ดใช้เวลาฝั่งเซิร์ฟเวอร์เป็นแกน x

