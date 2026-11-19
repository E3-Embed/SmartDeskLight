# โปรโตคอลการสื่อสาร

## โหนด → เกตเวย์ · ESP-NOW

struct แบบ packed นิยามไว้ใน [`firmware/common/message.h`](../firmware/common/message.h):

```c
{ version, type, node_id, seq, ts_ms, lux, r, g, b, c, cct }
```

เกตเวย์ตอบกลับด้วย `ACK { version, type, node_id, seq }` ถ้าไม่ได้รับ ACK ภายใน 100 ms โหนดจะส่งซ้ำได้สูงสุด 3 ครั้ง และเกตเวย์ตัดแพ็กเก็ตซ้ำด้วย `(node_id, seq)`

### Heartbeat ของโหนด (`SDL_MSG_SYS`)

นอกจาก telemetry ค่าที่วัดได้ (ประมาณทุก 1 วินาที) โหนดส่ง heartbeat สถานะระบบทุก 2 วินาที
แพ็กเก็ตนี้ใช้เส้นทาง ACK/ส่งซ้ำชุดเดียวกับ telemetry และใช้เป็น probe ค้นหาช่องสัญญาณด้วย

```c
{ version, type, node_id, seq, ts_ms, uptime_s, free_heap, min_free_heap,
  tx_attempts, tx_acked, reset_reason, channel, temp_cdeg }
```

- โหนดไม่ต้องตั้ง MAC หรือช่อง Wi-Fi ของเกตเวย์ล่วงหน้า: ตอนบูตจะยิง probe แบบ broadcast
  ไล่ช่อง 1–13 ช่องที่ได้ ACK คือช่องของ AP และ MAC ต้นทางของ ACK คือ MAC ของเกตเวย์
  จากนั้นสลับเป็น unicast และสแกนใหม่เองถ้าเงียบเกิน 15 วินาที (เช่น เกตเวย์รีบูตไปช่องอื่น)
- เกตเวย์จะไม่ตอบ ACK ให้ probe ที่ `channel` ไม่ตรงกับช่องที่ตัวเองอยู่ เพราะช่อง 2.4 GHz ที่ติดกัน
  ซ้อนทับกัน (probe ที่ยิงบนช่อง 5 อาจไปถึงเกตเวย์ช่อง 6) ถ้าตอบไปโหนดจะล็อกช่องผิดแล้ว unicast
  ไม่ถึงเลย — โหนดจึงสแกนต่อไปจนเจอช่องจริง ตรวจเฉพาะ probe (broadcast) ไม่ตรวจ heartbeat ปกติ
- `tx_acked / tx_attempts` คืออัตราส่งสำเร็จฝั่งโหนด (นับรวมการส่งซ้ำ) — ใช้ค่านี้เป็นตัวชี้วัด
  หลัก เพราะ `seq` เป็นตัวนับร่วมของทุกชนิดแพ็กเก็ต (ACK มีแค่ `node_id, seq`) การเอา
  `n1_rx / n1_seq` มาหารกันจึงต่ำกว่าความจริงเมื่อ heartbeat ปนอยู่
- `temp_cdeg` คืออุณหภูมิ SoC ของโหนด (หน่วย 0.1 °C) จากเซนเซอร์ภายใน ค่าสัมบูรณ์มี offset
  และต่างกันในแต่ละชิป จึงใช้ดูแนวโน้ม/ความร้อนสะสมในกล่องปิด มากกว่าวัดอุณหภูมิจริง
- เกตเวย์เก็บ heartbeat แยกจาก `lastSeenMs` ของ telemetry เพื่อไม่ให้ "โหนดยังอยู่แต่ยังไม่มีค่า lux"
  ถูกตีความเป็นข้อมูลเซนเซอร์สด (ControlTask จะยังถือว่าโหนด stale และไม่ปิดลูปควบคุม)

## เกตเวย์ ↔ EMQX (self-hosted) · MQTTS (พอร์ต 8883 ผ่าน NPMplus)

topic ของข้อมูลใช้รูปแบบเดียวกัน: `<root>/<source>/<kind>` โดย `root = @msg/sdl` และ
`source` เป็น `gw` หรือ `sensor`; ส่วนคำสั่งและแจ้งเตือนเป็น `<root>/cmd` กับ `<root>/alert`
เฟิร์มแวร์เก็บชื่อทั้งหมดไว้ที่ `cfg::kTopic*` ใน
[`config.h`](../firmware/gateway/src/config.h) และเป็นฝ่ายกำหนดชื่อ topic แต่เพียงผู้เดียว

| Topic | ทิศทาง | ข้อมูล |
|---|---|---|
| `@msg/sdl/gw/telemetry` | เกตเวย์ → คลาวด์ | สถานะเกตเวย์ (Wi-Fi, MQTT, NTP, heap, uptime, reset reason) ทุก 2 วินาที พร้อมค่าสดของเซนเซอร์เกตเวย์: `dist_mm, dist_ok, tof_ok, presence, presence_src, lamp_mW, bus_V, current_mA, ina_ok, energy_Wh` |
| `@msg/sdl/sensor/telemetry` | เกตเวย์ → คลาวด์ | **ค่าที่วัดได้** ของโหนดหนึ่งชุด: `lux, r, g, b, c, cct`; `node_id` ระบุว่าเป็นโหนดไหน |
| `@msg/sdl/sensor/health` | เกตเวย์ → คลาวด์ | **heartbeat/สุขภาพบอร์ด** ของโหนด ทุก 2 วินาที: `uptime_s, heap, reset, temp_c, tx_*` — ไม่มีค่าที่วัดได้ปนมา |
| `@msg/sdl/gw/state` | เกตเวย์ → คลาวด์ | snapshot ล่าสุดของทุกโหนดและสถานะโคม สำหรับ Dashboard (ทุก 10 วินาที) |
| `@msg/sdl/gw/state` | เกตเวย์ → คลาวด์ | snapshot ล่าสุดของทุกโหนดและสถานะโคม สำหรับ Dashboard (ทุก ~10 วินาที) — มีฟิลด์ `ts` (epoch วินาที, 0 จนกว่า NTP จะ sync) |
| `@msg/sdl/sensor/telemetry` | เกตเวย์ → คลาวด์ | ค่าที่วัดได้ของโหนด (`lux, r, g, b, c, cct`), `node_id` บอกว่าโหนดไหน; ส่งเฉพาะเมื่อ BH1750 อ่านสำเร็จ |
| `@msg/sdl/sensor/health` | เกตเวย์ → คลาวด์ | heartbeat/สุขภาพบอร์ดของโหนด (`uptime_s, heap, temp_c, reset, tx_acked, tx_attempts`) ทุก 2 วินาที |
| `@msg/sdl/cmd` | แดชบอร์ด → เกตเวย์ | โหมดกิจกรรม หรือ feedback จากผู้ใช้ |
| `@msg/sdl/alert` | เกตเวย์ → คลาวด์ | ข้อความแจ้งเตือน (ส่งเข้า Discord ด้วย) |
| `@msg/sdl/gw/status` | เกตเวย์ → คลาวด์ | `"online"` / `"offline"` แบบ **retained** — ตัวเกตเวย์ประกาศ `online` ตอนเชื่อมต่อ และ broker ประกาศ `offline` แทนผ่าน MQTT Last Will เมื่อขาดการเชื่อมต่อเกิน keepalive (30 วินาที) |
| `@msg/sdl/sensor/status` | เกตเวย์ → คลาวด์ | presence ของโหนดแบบ **retained**: `{"ts":…,"N1":"online","N2":"offline"}` — เกตเวย์เขียนแทนโหนดเพราะโหนดไม่มี MQTT session ของตัวเอง |

topic ทั้งหมดเป็น topic MQTT ธรรมดาบน EMQX ของเรา (`@` นำหน้าได้ตามสเปก) จึงไม่ต้องประกาศ alias แบบ NETPIE; เฟิร์มแวร์ publish ด้วย QoS 0 และ retain เฉพาะ `@msg/sdl/gw/status` กับ `@msg/sdl/sensor/status`

`@msg/sdl/gw/status` เป็น retained: แดชบอร์ดที่เพิ่ง subscribe จะได้สถานะล่าสุดทันทีโดยไม่ต้องรอรอบถัดไป จึงใช้แทนการเดาจาก `uptime_s` ใน `@msg/sdl/gw/telemetry` ได้

`@msg/sdl/sensor/status` เป็น retained แผนที่เดียวที่เกตเวย์เขียนแทนโหนด: `online` เมื่อมี heartbeat หรือค่าที่วัดได้ภายใน 10 วินาที (`kNodeStaleMs`) และ `offline` เมื่อเงียบกว่านั้น แต่ละโหนดมี key `N<id>`; โหนดที่เกตเวย์ยังไม่เคยเห็นในรอบบูตนี้จะไม่มี key (แปลว่าไม่ทราบสถานะ) เกตเวย์เขียนซ้ำทุกครั้งที่สถานะเปลี่ยน ทุกครั้งที่เชื่อมต่อใหม่ และทุก 30 วินาทีเพื่อให้ `ts` ใช้เป็นอายุของข้อมูลได้

> [!IMPORTANT]
> ถ้าเกตเวย์ออฟไลน์ จะไม่มีใครอัปเดต `@msg/sdl/sensor/status` ได้ — ค่าที่ค้างอยู่จะยังเป็น `online` แดชบอร์ดจึงต้องถือว่า presence ของโหนดใช้ได้เฉพาะเมื่อ `@msg/sdl/gw/status` เป็น `online` หรือเทียบ `ts` กับเวลาปัจจุบัน

> [!NOTE]
> **การย้ายชื่อ topic:** เดิมสถานะเกตเวย์อยู่ที่ `@msg/sdl/gateway/status` ตอนนี้ใช้ `@msg/sdl/gw/status` ให้ตรงกับกลุ่ม `gw/*` — หลังแฟลชเฟิร์มแวร์ใหม่แล้ว ให้ลบ retained message เก่าที่ `@msg/sdl/gateway/status` ใน EMQX Dashboard (MQTT → Retained) เพื่อไม่ให้ค้างอยู่ใน broker

heartbeat ของโหนดบน `@msg/sdl/sensor/health` (ค่าสุขภาพของบอร์ด):

```json
{"node_id":"N1","seq":42,"ts":1730300000,"node_ms":41200,"uptime_s":41,
 "heap":233472,"heap_min":231120,"wifi_ch":6,"reset":"poweron",
 "temp_c":47.5,"tx_acked":21,"tx_attempts":21}
```

ค่าที่วัดได้จาก BH1750/TCS34725 อยู่บน `@msg/sdl/sensor/telemetry` แยกจาก heartbeat คนละ topic
โหนดส่งเฉพาะเมื่ออ่าน BH1750 สำเร็จ (อ่านพลาดจะไม่ส่ง `lux` เป็น 0 แทน) `r/g/b/c` เป็นค่าดิบของ
TCS34725 ที่ 100.8 ms / gain 16x และเป็น 0 ทั้งหมดเมื่ออ่านสีไม่ได้
ส่วน `cct = 0` แปลว่าไม่มีค่าที่เชื่อถือได้ (มืดเกินไป อิ่มตัว หรืออ่านสีไม่ได้) ไม่ใช่ 0 K:

```json
{"node_id":"N1","seq":1024,"ts":1730300000,"node_ms":1024000,"lux":412.5,
 "r":810,"g":1020,"b":920,"c":1350,"cct":4300}
```

snapshot บน `@msg/sdl/gw/state`:

```json
{"device":"sdl-gateway","ts":1795003828,"n1_lux":412.5,"n1_cct":4300,"n1_up_s":41,
 "n1_heap":233472,"n1_sys_age_s":0,"dist_mm":385,"dist_ok":1,"tof_ok":1,
 "presence":1,"presence_src":"pir+tof","lamp_mW":3120,"bus_V":12.04,
 "current_mA":259,"ina_ok":1,"energy_Wh":1.284,"energy_reading_Wh":0.912,
 "energy_coding_Wh":0.372,"energy_drawing_Wh":0,"power_reading_mW":3110,
 "power_coding_mW":2900,"power_drawing_mW":0,
 "diffuser":1,"nd":0,"warm":0,"pwm":180,"safe":0,"mode":"reading",
 "target_lux":500,"target_cct":4000,"ai":0,"buffered":0,"dropped":0,
 "heap":182296,"uptime_s":1541}
```

`ts` เป็น epoch วินาทีของเกตเวย์ (0 จนกว่า NTP จะ sync) — ใช้จัดลำดับ/คำนวณอายุข้อมูลได้

`presence` มาจาก PIR **หรือ** VL53L0X (ระยะใกล้กว่า `cfg::kPresenceDistanceMm`): PIR ยืนยันด้วย
สัญญาณ HIGH ต่อเนื่องและถือค้าง 30 วินาที ส่วนระยะยืนยันสองรอบและถือค้าง 10 วินาที เพื่อไม่ให้มือ
หรือหนังสือที่ตัดลำแสงทำให้สถานะกระพริบ `presence_src` บอกว่าแหล่งใดเป็นผู้ยืนยัน (`pir`, `tof`,
`pir+tof`, `none`) `dist_ok=0` หมายถึงยังไม่มีเป้าที่วัดได้ (ค่า `dist_mm` เป็น 0) ไม่ใช่ระยะ 0 mm
`tof_ok`/`ina_ok` เป็น 0 เมื่อเซนเซอร์ไม่ตอบและกำลังพยายาม re-init — เกตเวย์ลองใหม่ทุก 5 วินาที

`energy_Wh` คือพลังงานสะสมตั้งแต่บูต จาก `lamp_mW` ที่ INA219 อ่านได้ (อินทิเกรตทุก 200 ms)
แยกตามโหมดใน `energy_<mode>_Wh`; `power_<mode>_mW` เป็นกำลังเฉลี่ยของเวลาที่โหมดนั้นทำงาน
ค่าทั้งคู่เป็น 0 จนกว่าโหมดนั้นจะได้ทำงาน จึงใช้เป็น metric พลังงานต่อโหมดในรายงานได้

## เกตเวย์ ↔ AI · HTTPS

```json
// request
{"lux":412,"cct":4300,"dist_mm":550,"presence":1,"activity":"reading",
 "filters":[1,0,0],"pwm":180,"feedback":[{"t":"21:40","v":"too_bright"}]}

// response
{"target_lux":450,"target_cct":4000,"filters":[1,0,1],"reason":"evening reading, user found it too bright"}
```

เกตเวย์จำกัด `target_lux` ให้อยู่ในช่วง 200–750 lux, จำกัดความถี่การขยับเซอร์โว และใช้โปรไฟล์ล่าสุดที่ใช้ได้ (หรือโปรไฟล์ตามกฎ) ต่อไปหากคำขอล้มเหลว

---

[← กลับไปที่ README](../README.md)
