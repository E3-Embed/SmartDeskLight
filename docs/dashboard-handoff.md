# Dashboard handoff — MQTT topics, payloads, and Postgres history

> สถานะ: โฟลเดอร์ `dashboard/` ถูก revert กลับไปที่ `HEAD` แล้ว
> เอกสารนี้สรุปสิ่งที่ต้องแก้ฝั่งแดชบอร์ดให้ตรงกับเฟิร์มแวร์และตารางที่ EMQX เขียนอยู่

## 1. สรุปสั้น

- เฟิร์มแวร์เปลี่ยน topic แล้ว แดชบอร์ดเดิมยังใช้ topic เก่า (`@shadow/data/update`,
  `@msg/sdl/sys`, `@msg/sdl/status`, `@msg/sdl/<node>/telemetry`) จึงแสดงข้อมูลไม่ครบ
- topic ใหม่ใช้รูปแบบ `@msg/sdl/<source>/<kind>` (`source` = `gw` | `sensor`)
- ค่าที่วัดได้กับ heartbeat ของโหนดแยกคนละ topic แล้ว:
  - `@msg/sdl/sensor/telemetry` = `lux, r, g, b, c, cct`
  - `@msg/sdl/sensor/health` = `uptime_s, heap, reset, temp_c, tx_*`
- EMQX PostgreSQL connector เขียน `public.sdl_sensor_telemetry` ได้แล้ว
  แดชบอร์ดควร **อ่าน** ตารางนี้สำหรับกราฟ 30 นาที/2 ชั่วโมง และ **ไม่ต้องเขียน DB เอง**
- retained มีแค่ `@msg/sdl/gw/status` กับ `@msg/sdl/sensor/status`
- topic `@msg/sdl/gateway/status` ถูกเปลี่ยนชื่อเป็น `@msg/sdl/gw/status`
  ต้องลบ retained message เก่าใน EMQX Dashboard → MQTT → Retained

## 2. Topic map

| Topic | ทิศทาง | ความถี่ | ข้อมูล |
|---|---|---|---|
| `@msg/sdl/gw/telemetry` | gateway → cloud | 2 s | สถานะเกตเวย์: Wi-Fi, heap, uptime, NTP, reset |
| `@msg/sdl/gw/state` | gateway → cloud | 10 s | snapshot ของโคม + ค่าล่าสุดของทุกโหนด (flat JSON) |
| `@msg/sdl/gw/status` | gateway → cloud | retained | `"online"` / `"offline"` (Last Will) |
| `@msg/sdl/sensor/telemetry` | gateway → cloud | ~1 s | ค่าที่วัดได้ของโหนด, `node_id` บอกว่าโหนดไหน |
| `@msg/sdl/sensor/health` | gateway → cloud | 2 s | heartbeat/สุขภาพบอร์ดของโหนด |
| `@msg/sdl/sensor/status` | gateway → cloud | retained, refresh 30 s | presence map `{"ts":…,"N1":"online"}` |
| `@msg/sdl/cmd` | dashboard → gateway | ตามคำสั่ง | `{"mode":"…"}` หรือ `{"feedback":"…"}` |
| `@msg/sdl/alert` | gateway → cloud | event | ข้อความแจ้งเตือน (plain text) |

### Mapping จากโค้ดแดชบอร์ดเดิม

| โค้ดเดิม | ใช้แทนด้วย |
|---|---|
| `TOPIC_SHADOW` = `@shadow/data/update` | `@msg/sdl/gw/state` (payload flat ไม่มี `{data:…}`) |
| `TOPIC_SYS` = `@msg/sdl/sys` | `@msg/sdl/gw/telemetry` |
| `TOPIC_STATUS` = `@msg/sdl/status` | `@msg/sdl/gw/status` |
| `@msg/sdl/<node>/telemetry` | `@msg/sdl/sensor/telemetry` (ใช้ `payload.node_id`) |
| — | `@msg/sdl/sensor/health` (ใหม่) |
| — | `@msg/sdl/sensor/status` (ใหม่, retained) |

ชื่อ topic ที่มี `@` และ `/` ต้องใส่ double quotes ใน rule SQL ของ EMQX

## 3. Payload ตัวอย่าง

### `@msg/sdl/gw/telemetry`

```json
{"device":"sdl-gateway","uptime_s":1231,"wifi_up":1,"wifi_code":3,
 "rssi":-47,"wifi_ch":1,"ip":"192.168.1.191","wifi_retries":0,
 "mqtt_fails":0,"ntp":1,"time":1794992724,"heap":182592,
 "heap_min":163120,"temp_c":49.6,"reset":"poweron","nodes":1,
 "mode":"reading","safe":0,"pwm":255,"buffered":0,"dropped":0}
```

### `@msg/sdl/gw/state`

```json
{"device":"sdl-gateway","n1_lux":15.83,"n1_cct":5675,"n1_age_s":0,
 "n1_rx":1226,"n1_seq":1849,"n1_up_s":1235,"n1_heap":280324,
 "n1_temp_c":43.7,"n1_sys_age_s":0,"dist_mm":0,"presence":0,
 "lamp_mW":0,"bus_V":0,"current_mA":0,"diffuser":1,"nd":0,"warm":0,
 "pwm":255,"safe":0,"mode":"reading","target_lux":500,
 "target_cct":4000,"ai":0,"buffered":0,"dropped":0,
 "heap":182296,"uptime_s":1230}
```

หมายเหตุ:
- `n<id>_age_s` = อายุของค่าที่วัดได้ล่าสุด
- `n<id>_sys_age_s` = อายุของ heartbeat ล่าสุด
- `presence` = PIR ที่เกตเวย์
- `safe` = สถานะปลอดภัยของโคม
- `target_lux` / `target_cct` / `pwm` ใช้ได้กับกราฟช่วง 5 นาที (ข้อมูลสด)

### `@msg/sdl/sensor/telemetry`

```json
{"node_id":"N1","seq":1849,"ts":1794992723,"node_ms":1235500,
 "lux":15.83333,"r":237,"g":289,"b":264,"c":749,"cct":5675}
```

- `ts` เป็น epoch **วินาที** (ไม่ใช่ ms)
- `cct = 0` แปลว่าไม่มีค่าที่เชื่อถือได้ (มืด/อิ่มตัว/อ่านสีไม่ได้)
- `lux` จะมีเมื่ออ่าน BH1750 สำเร็จเท่านั้น

### `@msg/sdl/sensor/health`

```json
{"node_id":"N1","seq":1850,"ts":1794992723,"node_ms":1235512,
 "uptime_s":1235,"heap":280324,"heap_min":279588,"wifi_ch":1,
 "reset":"poweron","temp_c":43.7,"tx_acked":1846,"tx_attempts":1858}
```

### `@msg/sdl/sensor/status`

```json
{"ts":1794992731,"N1":"online"}
```

- เป็น presence map ที่เกตเวย์เขียนแทนโหนด
- ใช้ได้เฉพาะเมื่อ `@msg/sdl/gw/status` เป็น `online` และ `ts` ยังใหม่
- ถ้าเกตเวย์ออฟไลน์ ค่าที่ค้างอยู่จะยังเป็น `online`

### `@msg/sdl/gw/status`

```text
"online"
```

หรือ

```text
"offline"
```

### `@msg/sdl/alert`

ข้อความ plain text เช่น

```text
Stop button pressed: lamp in safe state
```

ไม่ได้เป็น JSON — parser ต้องรองรับทั้ง plain text และ `{"text":…}`

### `@msg/sdl/cmd`

```json
{"mode":"reading"}
{"mode":"coding"}
{"mode":"drawing"}
{"feedback":"too_bright"}
{"feedback":"too_dim"}
```

## 4. Postgres

ตารางที่ EMQX เขียน (ตรงกับ action ที่ใช้งานอยู่):

```sql
CREATE TABLE IF NOT EXISTS public.sdl_sensor_telemetry (
  msgid   text PRIMARY KEY,
  qos     smallint,
  arrived timestamptz NOT NULL DEFAULT now(),
  node_id text NOT NULL,
  seq     bigint,
  ts      bigint,              -- epoch seconds
  node_ms bigint,
  lux     double precision,
  r       integer,
  g       integer,
  b       integer,
  c       integer,
  cct     integer
);
```

แนะนำให้เพิ่ม index สำหรับ query ของแดชบอร์ด:

```sql
CREATE INDEX IF NOT EXISTS sdl_sensor_telemetry_node_ts_idx
  ON public.sdl_sensor_telemetry (node_id, ts DESC);

CREATE INDEX IF NOT EXISTS sdl_sensor_telemetry_ts_idx
  ON public.sdl_sensor_telemetry (ts DESC);
```

### Query สำหรับ `/api/history`

```sql
SELECT
  COALESCE(NULLIF(ts, 0), EXTRACT(EPOCH FROM arrived)::bigint) AS epoch_s,
  lux,
  cct
FROM public.sdl_sensor_telemetry
WHERE node_id = $1
  AND lux IS NOT NULL
  AND COALESCE(NULLIF(ts, 0), EXTRACT(EPOCH FROM arrived)::bigint) >= $2
ORDER BY epoch_s ASC
LIMIT 20000;
```

- `$1` = `'N1'`
- `$2` = `Math.floor(sinceMs / 1000)`
- แปลง `epoch_s` เป็น ms ด้วย `Number(epoch_s) * 1000`
- ตารางนี้มีแค่ `lux`/`cct` ไม่มี `target_lux`, `target_cct`, `pwm`
  - กราฟ 30 นาที/2 ชั่วโมงจะวาดเส้นเป้าหมาย/PWM ไม่ได้
  - กราฟ 5 นาทีที่ใช้ข้อมูลสดยังมี target/PWM จาก `gw/state`
  - ถ้าต้องการ target/PWM ย้อนหลัง ต้องเพิ่มตาราง/action สำหรับ `gw/state`
    แล้ว join ตามเวลา หรือเก็บ `target_lux`/`pwm` เพิ่มในอนาคต

### สิ่งที่ต้องลบออกจากแดชบอร์ด

โค้ดเดิมมี DB writer ของตัวเอง (`lib/source/index.ts` → `attachDbWriter`,
`lib/db.ts` → `insertSamples`) ซึ่งเขียนตาราง `samples` แยกจาก EMQX
แนะนำให้ลบ writer นี้ออก เพื่อไม่ให้มีสองคนเขียน DB:

- ลบ `attachDbWriter()` และ `initDb()` / `insertSamples()` ที่ไม่ใช้แล้ว
- `lib/db.ts` เหลือแค่ `fetchSamples()` (อ่านอย่างเดียว) + `dbStatus()`
- ตั้ง `DATABASE_URL` ใน `.env.local`
- ถ้า `DATABASE_URL` ไม่ถูกตั้ง ให้ fallback ไป ring buffer ในหน่วยความจำ

## 5. สิ่งที่ต้องแก้ในโค้ดแดชบอร์ด

รายการไฟล์ที่เกี่ยวกับ topic/DB:

| ไฟล์ | สิ่งที่ต้องทำ |
|---|---|
| `lib/topics.ts` (ใหม่) | นิยาม topic constants ชุดเดียวกับ `firmware/gateway/src/config.h` |
| `lib/parse.ts` | `parseSnapshot` (`gw/state`), `parseGatewayTelemetry` (`gw/telemetry`), `parseSensorStatus` |
| `lib/types.ts` | `PublicState` ใช้ `snapshot`, `gateway`, `sensors` แทน `shadow`, `sys` |
| `lib/store.ts` | handle `gw/state`, `gw/telemetry`, `gw/status`, `sensor/telemetry`, `sensor/status`, `alert` |
| `lib/source/mqtt.ts` | subscribe `${TOPIC_PREFIX}/#`; publish `@msg/sdl/cmd` |
| `lib/source/netpie.ts` | ถ้ายังใช้ `SOURCE=netpie` ให้ map topic เก่า → topic ใหม่ |
| `lib/derive.ts` | ใช้ `snapshot`/`gateway`; `nodeOnline` จาก `sensor/status` หรือ `n1_age_s` |
| `lib/mock.ts` | publish topic ใหม่ (mock ต้องจำลอง `gw/state` 10 วิ, `gw/telemetry` 2 วิ, presence 30 วิ) |
| `lib/db.ts` | query `public.sdl_sensor_telemetry`; ลบ writer |
| `lib/source/index.ts` | ลบ `attachDbWriter` |
| `app/api/history/route.ts` | ใช้ DB เฉพาะ `SOURCE=mqtt`; fallback memory |
| `app/api/health/route.ts` | ages ใช้ `snapshotAt`, `gatewayAt`, `telemetryAt`, `sensorsAt` |
| `components/dashboard.tsx` | `EMPTY_STATE` และ health checks ใช้ field ใหม่ |
| `components/system.tsx` | `state.snapshot` / `state.gateway`; RawSheet tabs `state/gateway/telemetry/presence` |
| `components/charts.tsx` | target/PWM เป็น optional (history ไม่มี) |
| `scripts/probe.mjs` | subscribe topic ใหม่ |
| `README.md`, `.env.example` | อัปเดต topic และ DB description |
| `lib/derive.test.ts` | แก้ field names; เพิ่ม test presence map |
| `lib/parse.test.ts` (ใหม่) | test parser ของทุก topic |

### วิธี subscribe

```ts
client.subscribe(`${TOPIC_PREFIX}/#`, { qos: 1 });
```

Subscription เดียวครอบคลุมทุก topic ของข้อมูล ไม่ต้อง subscribe `@shadow/data/update` อีก

### วิธี publish คำสั่ง

```ts
client.publish(TOPIC_CMD, JSON.stringify({ mode: "coding" }), { qos: 1 });
```

### ACL ของ EMQX

user `dashboard` ต้องมี:

| Action | Topic |
|---|---|
| Subscribe | `@msg/sdl/#` |
| Publish | `@msg/sdl/cmd` |

ไม่ต้องให้สิทธิ์ `@shadow/data/update` อีก

## 6. พฤติกรรมที่ต้องรู้

- `@msg/sdl/gw/state` **ไม่ retained** — หน้าใหม่ต้องรอสูงสุด ~10 วิ
  (มีสถานะ “รอข้อมูล” ให้เห็น)
- `@msg/sdl/gw/status` และ `@msg/sdl/sensor/status` **retained** — ได้ค่าล่าสุดทันที
  ที่ subscribe
- `@msg/sdl/sensor/telemetry` อาจไม่มีช่วงหนึ่งถ้า BH1750 อ่านไม่สำเร็จ
  แต่ `@msg/sdl/sensor/health` ยังมาเรื่อย ๆ
- `@msg/sdl/sensor/status` บอกว่า “โหนดยังมีชีวิต” ไม่ได้แปลว่ามีค่า lux ใหม่
  ต้องดู `n1_age_s` ใน `gw/state` อีกชั้น
- `gw/state` ยังไม่มีฟิลด์ `ts` ในเฟิร์มแวร์ปัจจุบัน — ถ้าจะใช้เวลาจากเกตเวย์
  ต้องเพิ่ม `d["ts"] = app::nowEpoch();` ใน `publishState()` ก่อน
- `@msg/sdl/alert` เป็น plain text, ไม่ใช่ JSON
- ใน CSV ที่ export จาก DB ช่อง `topic` อาจขึ้นต้นด้วย `'`
  (เช่น `'@msg/sdl/sensor/telemetry`) — เป็นการบังคับ text ของ Excel
  topic จริงบน MQTT ไม่มี apostrophe

## 7. ทดสอบเร็ว ๆ

```bash
cd dashboard
pnpm probe
```

ต้องเห็น:

```text
✓ @msg/sdl/gw/status
✓ @msg/sdl/sensor/status
✓ @msg/sdl/gw/telemetry
✓ @msg/sdl/sensor/telemetry
✓ @msg/sdl/sensor/health
✓ @msg/sdl/gw/state
```

ตรวจ DB:

```sql
SELECT count(*) FROM public.sdl_sensor_telemetry;

SELECT node_id, to_timestamp(ts), lux, cct
  FROM public.sdl_sensor_telemetry
 ORDER BY ts DESC
 LIMIT 10;
```

ตรวจ API:

```bash
curl http://localhost:3000/api/health
curl "http://localhost:3000/api/history?range=30m"
```

## 8. สถานะของ repo ตอนส่งงาน

- แดชบอร์ด: revert กลับ `HEAD` แล้ว ไม่มี diff
- เฟิร์มแวร์: แก้ topic แล้ว (`kTopicSensorHealth`, `kTopicStatus = @msg/sdl/gw/status`,
  heartbeat แยกออกจาก sensor readings)
- เอกสาร: `docs/protocols.md` และ `firmware/gateway/README.md` อัปเดตแล้ว
- `infra/db/`: มี schema/collector ทางเลือก (schema `sdl.*`) — ตารางที่ใช้งานจริง
  ตอนนี้คือ `public.sdl_sensor_telemetry` จาก EMQX connector
- อย่าลืมลบ retained message เก่าที่ `@msg/sdl/gateway/status`
