# โปรโตคอลการสื่อสาร

## โหนด → เกตเวย์ · ESP-NOW

struct แบบ packed นิยามไว้ใน [`firmware/common/message.h`](../firmware/common/message.h):

```c
{ version, type, node_id, seq, ts_ms, lux, r, g, b, c, cct }
```

เกตเวย์ตอบกลับด้วย `ACK { version, type, node_id, seq }` ถ้าไม่ได้รับ ACK ภายใน 100 ms โหนดจะส่งซ้ำได้สูงสุด 3 ครั้ง และเกตเวย์ตัดแพ็กเก็ตซ้ำด้วย `(node_id, seq)`

## เกตเวย์ ↔ NETPIE2020 · MQTTS (พอร์ต 1884)

| Topic | ทิศทาง | ข้อมูล |
|---|---|---|
| `@msg/sdl/<node_id>/telemetry` | เกตเวย์ → คลาวด์ | JSON ดิบทีละค่าที่วัดได้ |
| `@shadow/data/update` | เกตเวย์ → คลาวด์ | สถานะของแต่ละโหนด สำหรับ Feed และ Dashboard (ทุก 30 วินาที) |
| `@msg/sdl/cmd` | แดชบอร์ด → เกตเวย์ | โหมดกิจกรรม หรือ feedback จากผู้ใช้ |
| `@msg/sdl/alert` | เกตเวย์ → คลาวด์ | ข้อความแจ้งเตือน (ส่งเข้า Discord ด้วย) |

```json
{"node_id":"N1","seq":1024,"ts":1730300000,"lux":412.5,"cct":4300,"dist_mm":550,
 "presence":1,"lamp_mW":3120,"filters":[1,0,0],"pwm":180,"mode":"reading"}
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
