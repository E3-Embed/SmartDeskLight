# เฟิร์มแวร์เกตเวย์ (ESP32 B)

ผู้รับผิดชอบ: นรินธร ยางงาม — Embedded Developer (Gateway & Cloud)

เกตเวย์รับค่าจากโหนดเซนเซอร์ผ่าน ESP-NOW อ่านเซนเซอร์ของตัวเอง ควบคุมโคมไฟแบบวงปิด และสื่อสารกับ NETPIE2020, LLM API และ Discord

## Task

| Task | Priority | Core | ไฟล์ | หน้าที่ |
|---|:-:|:-:|---|---|
| `ControlTask` | 4 | 1 | `src/control.cpp` | เหตุการณ์ปุ่มหยุด, สถานะปลอดภัย, ควบคุมแบบวงปิดจาก lux ที่วัดได้ (ฟิลเตอร์ + PWM) |
| `EspNowRxTask` | 3 | 1 | `src/espnow_link.cpp` | ดึงแพ็กเก็ต ESP-NOW, ตัดแพ็กเก็ตซ้ำด้วย `(node_id, seq)`, ตารางโหนด |
| `SensorTask` | 2 | 1 | `src/sensors.cpp` | อ่านระยะ VL53L0X, การมีคนอยู่จาก PIR และกำลังไฟจาก INA219 ทุก 200 ms |
| `CloudTask` | 1 | 0 | `src/cloud.cpp` | Wi-Fi, NETPIE MQTTS, เก็บแล้วส่งต่อ, shadow, คำสั่ง, AI, การแจ้งเตือน |
| `loop()` | 1 | 1 | `src/main.cpp` | LED สถานะ (ติดค้าง = เชื่อมคลาวด์ได้, กะพริบ = ออฟไลน์) |

**เหตุผลของ priority:** ความปลอดภัยและการควบคุมต้องไม่รอเครือข่าย `ControlTask` จึงสูงสุด รองลงมาคือ `EspNowRxTask` เพื่อไม่ให้คิววิทยุ 32 ช่องล้น เซนเซอร์อ่านเป็นรอบและไม่เร่งด่วน ส่วนงานคลาวด์ (TLS, HTTP) อาจบล็อกได้หลายวินาที จึงต่ำสุดและแยกไปทำงานบน core 0 ตัวเดียว

**การสื่อสารระหว่าง task (E1):**

| กลไก | จาก → ไป | ข้อมูลที่ส่ง |
|---|---|---|
| คิว `qTelemetry` | callback ของ ESP-NOW → EspNowRxTask | แพ็กเก็ต `SdlTelemetry` |
| คิว `qCloud` | EspNowRxTask → CloudTask | ค่าที่อ่านใหม่ + เวลาที่ได้รับ |
| คิว `qControl` | ISR ปุ่มหยุด, CloudTask → ControlTask | หยุด, โหมด, feedback, โปรไฟล์ใหม่จาก AI |
| คิว `qAlerts` | ทุก task → CloudTask | ข้อความแจ้งเตือนสำหรับ Discord / NETPIE |
| event group `events` | CloudTask ↔ task อื่น | Wi-Fi พร้อม, MQTT พร้อม, "ขอโปรไฟล์จาก AI" |
| mutex `stateMutex` | ทุก task | `app::state` ที่ใช้ร่วมกัน (ผ่าน `StateLock`) |

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `src/config.h` | ขา, เวลา, ค่าเกนการควบคุม, topic ของ NETPIE — แก้ค่าเหล่านี้ที่นี่ที่เดียว |
| `src/app.h/.cpp` | ชนิดข้อมูลที่ใช้ร่วมกัน, คิว, mutex, event group, `raiseAlert()` |
| `src/ca_bundle.h` | ผูก CA bundle ที่ฝังมากับ ESP32 เข้ากับ `WiFiClientSecure` (รองรับทั้ง core 2.x และ 3.x) |
| `src/ina219.h/.cpp` | **ไดรเวอร์ INA219 ที่เขียนเอง** ระดับรีจิสเตอร์ (E8) |
| `src/lamp.h/.cpp` | เซอร์โวฟิลเตอร์ (จำกัดมุม, จำกัดความถี่, timeout ปลด servo) และ PWM ของ LED |
| `src/espnow_link.h/.cpp` | รับ ESP-NOW + ตอบ ACK, ตารางโหนด, โหนดจำลอง |
| `src/sensors.h/.cpp` | SensorTask |
| `src/control.h/.cpp` | ControlTask, โปรไฟล์ตามกฎ, จำกัดค่าที่ได้จาก AI |
| `src/ai_client.h/.cpp` | ส่งคำขอไปยัง Gemini API และแปลง JSON |
| `src/cloud.h/.cpp` | CloudTask: MQTTS, backlog, shadow, คำสั่ง, Discord |
| `src/ring_buffer.h` | FIFO ขนาดคงที่สำหรับเก็บแล้วส่งต่อ |

## ลูปควบคุม

ทุก 200 ms `ControlTask` จะ:

1. จัดการเหตุการณ์ในคิว (ปุ่มหยุดสลับสถานะปลอดภัย; โหมด / feedback / โปรไฟล์จาก AI เปลี่ยนค่าเป้าหมาย)
2. **สถานะปลอดภัย** (กดปุ่มหยุด) → พับฟิลเตอร์ออก, LED ระดับกลาง, ไม่ขยับอย่างอื่น
3. **เซนเซอร์ขัดข้อง** (ไม่มีแพ็กเก็ตจากโหนด 1 นาน 10 วินาที) → ความสว่างระดับปลอดภัย + แจ้งเตือน Discord แล้วกลับมาทำงานเองเมื่อมีข้อมูล
4. **ไม่มีคนที่โต๊ะ** (PIR ไม่ตรวจพบการเคลื่อนไหว 5 นาที) → ปิด LED และขอโปรไฟล์จาก AI ใหม่เมื่อมีคนกลับมา
5. กรณีปกติ: ขยับฟิลเตอร์ตามโปรไฟล์ (เปลี่ยนได้สูงสุดครั้งละหนึ่งแผ่นทุก 10 วินาที) แล้วปรับ PWM แบบ proportional: `pwm += clamp(Kp × (target − lux), ±12)` และคงค่าไว้เมื่อค่าคลาดเคลื่อนอยู่ในช่วง ±7 % ของเป้าหมาย
6. ถ้า PWM ถึงขีดสุดแล้วยังไม่ถึงเป้าหมาย จะสลับฟิลเตอร์ ND — แอคชูเอเตอร์เชิงกลช่วยขยายช่วงที่ PWM อย่างเดียวทำไม่ได้

AI เสนอแค่ `target_lux`, `target_cct` และชุดฟิลเตอร์ ส่วน `control::sanitize()` จำกัดค่าให้อยู่ในช่วง 200–750 lux หากติดต่อ AI ไม่ได้ จะใช้โปรไฟล์ตามกฎ (`control::ruleProfile()`) ต่อไป

## Embedded Engineering Depth ในเฟิร์มแวร์นี้

| หัวข้อ | อยู่ที่ | สิ่งที่ต้องแสดงตอนเดโม |
|---|---|---|
| E1 RTOS | `main.cpp`, `app.h` | 4 task, priority, queue, mutex, event group |
| E2 Interrupt | `main.cpp` `onStopButton()` | ISR ทำแค่ debounce และส่งเหตุการณ์ ส่วน `ControlTask` เป็นผู้ทำงานจริง |
| E4 Reliable comms | `espnow_link.cpp`, `cloud.cpp`, `ring_buffer.h` | ACK + ตัวนับแพ็กเก็ตซ้ำ; ถอด Wi-Fi แล้วค่าจะถูกเก็บในบัฟเฟอร์ (`buffered` ใน shadow) จากนั้นส่งต่อตามลำดับ |
| E5 Security | `cloud.cpp` `ensureMqtt()`, `ca_bundle.h` | MQTTS พอร์ต 8883 ตรวจใบรับรองของ broker ด้วย CA bundle ที่ฝังมากับ ESP32 (`ca::useBuiltin()`) **ก่อน**ส่ง token; รอ NTP ให้ตรงก่อนทุกครั้งเพราะการตรวจลูกโซ่ใช้เวลาระบบ; ข้อมูลลับอยู่ใน `secrets.h` ที่ git ไม่ติดตามเท่านั้น |
| E8 Own driver | `ina219.cpp` | คณิตศาสตร์การ calibrate, การอ่านรีจิสเตอร์; เทียบกับมัลติมิเตอร์ / logic analyzer |

## การตั้งค่า

1. **NETPIE2020:** สร้าง device แล้วคัดลอก Client ID / Token / Secret ไปใส่ใน `include/secrets.h` (คัดลอกจาก `secrets.example.h`)
2. **ตรวจใบรับรอง NETPIE (E5):** พอร์ต 8883 ของ broker ส่งใบรับรองที่ต่อลูกโซ่ถึง root สาธารณะ "USERTrust RSA Certification Authority" ซึ่งมีอยู่ใน CA bundle ที่ฝังมากับ Arduino core เฟิร์มแวร์จึงเรียก `ca::useBuiltin()` (ห่อ `useBuiltinCACertBundle()` บน core 3.x และ `setCACertBundle()` บน core 2.x) — ไม่ต้องมีไฟล์ PEM หรือ pin fingerprint อีก ตรวจสายลูกโซ่เองได้ด้วย
   `openssl s_client -connect mqtt.netpie.io:8883 -servername mqtt.netpie.io </dev/null | openssl x509 -noout -issuer`
   พอร์ต 1884 ใช้ใบรับรองจาก CA ภายในของ NETPIE ("NEXPIE Device Broker") ซึ่ง root สาธารณะตรวจไม่ได้ จึงย้ายมาใช้ 8883; ถ้า broker ไม่รับ MQTT บน 8883 ให้ย้อนกลับไป 1884 พร้อม pin fingerprint
   การตรวจลูกโซ่ใช้เวลาระบบเป็นตัวเทียบวันหมดอายุ เกตเวย์จึงรอ NTP ซิงก์สำเร็จก่อนเปิด TLS ทุกครั้ง (ถ้าไม่สำเร็จใน 60 วินาทีจะตั้ง SNTP ใหม่)
3. **AI:** ใส่ Gemini API key ใน `LLM_API_KEY` (เว้นว่าง = ใช้โปรไฟล์ตามกฎอย่างเดียว) ชื่อโมเดลอยู่ที่ `cfg::kAiModel`
4. **Discord:** สร้าง webhook ของช่องแชตแล้วใส่ URL ใน `DISCORD_WEBHOOK`
5. **ช่องสัญญาณของโหนดเซนเซอร์:** ESP-NOW ทำงานได้เมื่อโหนดใช้ช่อง Wi-Fi เดียวกับเกตเวย์ ตอนบูตเกตเวย์จะพิมพ์ `[espnow] ready, MAC …, channel N` — โหนดต้องเรียก `esp_wifi_set_channel(N, WIFI_SECOND_CHAN_NONE)` และใช้ MAC นี้เป็น `GATEWAY_MAC`
6. บิลด์และแฟลช: `pio run -d firmware/gateway -t upload && pio device monitor -d firmware/gateway`

**หมายเหตุ TLS:** ทุกปลายทาง (NETPIE 8883, Gemini, Discord) ตรวจใบรับรองด้วย CA bundle ที่ฝังมากับ ESP32 ไม่มีการเรียก `setInsecure()` ในบิลด์ปกติ สำหรับการดีบักบนเครื่องตัวเองเท่านั้นที่บิลด์ด้วย `-DALLOW_INSECURE_TLS` เพื่อข้ามการตรวจ — ห้ามใช้ในการเดโม

### Topic ของ NETPIE

| Topic | ทิศทาง | ข้อมูล |
|---|---|---|
| `@msg/sdl/N<id>/telemetry` | เกตเวย์ → คลาวด์ | ค่าที่อ่านได้หนึ่งชุด: `node_id, seq, ts, node_ms, lux, r, g, b, c, cct` |
| `@shadow/data/update` | เกตเวย์ → คลาวด์ ทุก 30 วินาที | `n1_lux, n1_cct, n1_rx, n1_seq, dist_mm, presence, lamp_mW, diffuser, nd, warm, pwm, safe, mode, target_lux, ai, buffered, dropped, heap, uptime_s` |
| `@msg/sdl/cmd` | แดชบอร์ด → เกตเวย์ | `{"mode":"coding"}` หรือ `{"feedback":"too_bright"}` / `"too_dim"` |
| `@msg/sdl/alert` | เกตเวย์ → คลาวด์ | ข้อความแจ้งเตือน (ส่งเข้า Discord ด้วย) |

### โปรเจกต์บน NETPIE

Project `SmartDeskLight`, group `sdl-group`, device `gateway` (เฟิร์มแวร์นี้) และ `dashboard` (ฝั่งแดชบอร์ดที่ publish `@msg/sdl/cmd`) device `gateway` มี schema ที่เปิด Feed ไว้สำหรับ `n1_lux, n1_cct, lamp_mW, pwm, target_lux, dist_mm, presence, buffered` (เป็นตัวเลขทั้งหมด) ฟิลด์อื่นยังอยู่ใน shadow แต่ไม่ถูกเก็บลง Feed การอัปเดต shadow ทุก 30 วินาทีอยู่ในโควตาฟรีอย่างสบาย

### ตัวชี้วัดที่อ่านได้จาก shadow

- **อัตราการส่งแพ็กเก็ตสำเร็จ:** `n1_rx / n1_seq` (จำนวนแพ็กเก็ตไม่ซ้ำที่ได้รับ ÷ จำนวนที่โหนดส่ง)
- **Uptime:** `uptime_s`; **กำลังไฟแต่ละโหมด:** `lamp_mW` คู่กับ `mode`, `pwm` และฟิลด์ฟิลเตอร์
- **เก็บแล้วส่งต่อ:** `buffered` เพิ่มขึ้นขณะออฟไลน์ และลดลงเหลือ 0 หลังเชื่อมต่อได้อีกครั้ง ส่วน `dropped` ต้องเป็น 0 เมื่อขาดการเชื่อมต่อไม่เกินราว 5 นาที

### ทดสอบการขยายระบบ

ตั้ง `cfg::kSimulatedNodes = 2` ใน `config.h` เพื่อเพิ่มโหนดจำลอง 101 และ 102 คู่กับโหนดจริง 1 แต่ละโหนดจะมี topic `N<id>` และฟิลด์ `n<id>_*` ใน shadow เป็นของตัวเอง
