# โปรโตคอลการสื่อสาร

## โหนด → เกตเวย์ · ESP-NOW

struct แบบ packed นิยามไว้ใน [`firmware/common/message.h`](../firmware/common/message.h):

```c
{ version, type, node_id, seq, ts_ms, lux, r, g, b, c, cct }
```

เกตเวย์ตอบกลับด้วย `ACK { version, type, node_id, seq }` ถ้าไม่ได้รับ ACK ภายใน 100 ms โหนดจะส่งซ้ำได้สูงสุด 3 ครั้ง และเกตเวย์ตัดแพ็กเก็ตซ้ำด้วย `(node_id, seq)`

### Heartbeat ของโหนด (`SDL_MSG_SYS`)

ระหว่างที่ไดรเวอร์เซนเซอร์ยังไม่เสร็จ โหนดส่ง heartbeat สถานะระบบทุก 2 วินาที แพ็กเก็ตนี้ใช้
เส้นทาง ACK/ส่งซ้ำชุดเดียวกับ telemetry และใช้เป็น probe ค้นหาช่องสัญญาณด้วย

```c
{ version, type, node_id, seq, ts_ms, uptime_s, free_heap, min_free_heap,
  tx_attempts, tx_acked, reset_reason, channel, temp_cdeg }
```

- โหนดไม่ต้องตั้ง MAC หรือช่อง Wi-Fi ของเกตเวย์ล่วงหน้า: ตอนบูตจะยิง probe แบบ broadcast
  ไล่ช่อง 1–13 ช่องที่ได้ ACK คือช่องของ AP และ MAC ต้นทางของ ACK คือ MAC ของเกตเวย์
  จากนั้นสลับเป็น unicast และสแกนใหม่เองถ้าเงียบเกิน 15 วินาที (เช่น เกตเวย์รีบูตไปช่องอื่น)
- `tx_acked / tx_attempts` คืออัตราส่งสำเร็จฝั่งโหนด (นับรวมการส่งซ้ำ)
- `temp_cdeg` คืออุณหภูมิ SoC ของโหนด (หน่วย 0.1 °C) จากเซนเซอร์ภายใน ค่าสัมบูรณ์มี offset
  และต่างกันในแต่ละชิป จึงใช้ดูแนวโน้ม/ความร้อนสะสมในกล่องปิด มากกว่าวัดอุณหภูมิจริง
- เกตเวย์เก็บ heartbeat แยกจาก `lastSeenMs` ของ telemetry เพื่อไม่ให้ "โหนดยังอยู่แต่ยังไม่มีค่า lux"
  ถูกตีความเป็นข้อมูลเซนเซอร์สด (ControlTask จะยังถือว่าโหนด stale และไม่ปิดลูปควบคุม)

## เกตเวย์ ↔ EMQX (self-hosted) · MQTTS (พอร์ต 8883 ผ่าน NPMplus)

| Topic | ทิศทาง | ข้อมูล |
|---|---|---|
| `@msg/sdl/gw/telemetry` | เกตเวย์ → คลาวด์ | สถานะเกตเวย์ (Wi-Fi, MQTT, NTP, heap, uptime, reset reason) ทุก 2 วินาที |
| `@msg/sdl/sensor/telemetry` | เกตเวย์ → คลาวด์ | ข้อมูลของโหนดเซนเซอร์หนึ่งชุด — heartbeat ทุก 2 วินาที และค่าที่วัดได้เมื่อไดรเวอร์เสร็จ; `node_id` ระบุว่าเป็นโหนดไหน |
| `@msg/sdl/gw/state` | เกตเวย์ → คลาวด์ | snapshot ล่าสุดของทุกโหนดและสถานะโคม สำหรับ Dashboard (ทุก 30 วินาที) |
| `@msg/sdl/cmd` | แดชบอร์ด → เกตเวย์ | โหมดกิจกรรม หรือ feedback จากผู้ใช้ |
| `@msg/sdl/alert` | เกตเวย์ → คลาวด์ | ข้อความแจ้งเตือน (ส่งเข้า Discord ด้วย) |
| `@msg/sdl/gateway/status` | เกตเวย์ → คลาวด์ | `"online"` / `"offline"` แบบ **retained** — ตัวเกตเวย์ประกาศ `online` ตอนเชื่อมต่อ และ broker ประกาศ `offline` แทนผ่าน MQTT Last Will เมื่อขาดการเชื่อมต่อเกิน keepalive (30 วินาที) |
| `@msg/sdl/sensor/status` | เกตเวย์ → คลาวด์ | presence ของโหนดแบบ **retained**: `{"ts":…,"N1":"online","N2":"offline"}` — เกตเวย์เขียนแทนโหนดเพราะโหนดไม่มี MQTT session ของตัวเอง |

topic ทั้งหมดเป็น topic MQTT ธรรมดาบน EMQX ของเรา (`@` นำหน้าได้ตามสเปก) จึงไม่ต้องประกาศ alias แบบ NETPIE; เฟิร์มแวร์ publish ด้วย QoS 0 และ retain เฉพาะ `@msg/sdl/gateway/status` กับ `@msg/sdl/sensor/status`

`@msg/sdl/gateway/status` เป็น retained: แดชบอร์ดที่เพิ่ง subscribe จะได้สถานะล่าสุดทันทีโดยไม่ต้องรอรอบถัดไป จึงใช้แทนการเดาจาก `uptime_s` ใน `@msg/sdl/gw/telemetry` ได้

`@msg/sdl/sensor/status` เป็น retained แผนที่เดียวที่เกตเวย์เขียนแทนโหนด: `online` เมื่อมี heartbeat หรือค่าที่วัดได้ภายใน 10 วินาที (`kNodeStaleMs`) และ `offline` เมื่อเงียบกว่านั้น แต่ละโหนดมี key `N<id>`; โหนดที่เกตเวย์ยังไม่เคยเห็นในรอบบูตนี้จะไม่มี key (แปลว่าไม่ทราบสถานะ) เกตเวย์เขียนซ้ำทุกครั้งที่สถานะเปลี่ยน ทุกครั้งที่เชื่อมต่อใหม่ และทุก 30 วินาทีเพื่อให้ `ts` ใช้เป็นอายุของข้อมูลได้

> [!IMPORTANT]
> ถ้าเกตเวย์ออฟไลน์ จะไม่มีใครอัปเดต `@msg/sdl/sensor/status` ได้ — ค่าที่ค้างอยู่จะยังเป็น `online` แดชบอร์ดจึงต้องถือว่า presence ของโหนดใช้ได้เฉพาะเมื่อ `@msg/sdl/gateway/status` เป็น `online` หรือเทียบ `ts` กับเวลาปัจจุบัน

heartbeat ของโหนดบน `@msg/sdl/sensor/telemetry` (ตอนนี้ยังไม่มีเซนเซอร์ จึงมีแต่ค่าสุขภาพ):

```json
{"node_id":"N1","seq":42,"ts":1730300000,"node_ms":41200,"uptime_s":41,
 "heap":233472,"heap_min":231120,"wifi_ch":6,"reset":"poweron",
 "temp_c":47.5,"tx_acked":21,"tx_attempts":21}
```

ค่าที่วัดได้ (เมื่อไดรเวอร์ BH1750/TCS34725 เสร็จ) ใช้ topic เดียวกัน:

```json
{"node_id":"N1","seq":1024,"ts":1730300000,"node_ms":1024000,"lux":412.5,
 "r":810,"g":1020,"b":920,"c":1350,"cct":4300}
```

snapshot บน `@msg/sdl/gw/state`:

```json
{"device":"sdl-gateway","n1_lux":412.5,"n1_cct":4300,"n1_up_s":41,"n1_heap":233472,
 "n1_sys_age_s":0,"dist_mm":550,"presence":1,"lamp_mW":3120,"filters":[1,0,0],
 "pwm":180,"mode":"reading"}
```

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
