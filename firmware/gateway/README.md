# เฟิร์มแวร์เกตเวย์ (ESP32 B)

ผู้รับผิดชอบ: นรินธร ยางงาม — Embedded Developer (Gateway & Cloud)

เกตเวย์รับค่าจากโหนดเซนเซอร์ผ่าน ESP-NOW อ่านเซนเซอร์ของตัวเอง ควบคุมโคมไฟแบบวงปิด และสื่อสารกับ EMQX (self-hosted), LLM API และ Discord

## Task

| Task | Priority | Core | ไฟล์ | หน้าที่ |
|---|:-:|:-:|---|---|
| `ControlTask` | 4 | 1 | `src/control.cpp` | เหตุการณ์ปุ่มหยุด, สถานะปลอดภัย, ควบคุมแบบวงปิดจาก lux ที่วัดได้ (ฟิลเตอร์ + PWM) |
| `EspNowRxTask` | 3 | 1 | `src/espnow_link.cpp` | ดึงแพ็กเก็ต ESP-NOW, ตัดแพ็กเก็ตซ้ำด้วย `(node_id, seq)`, ตารางโหนด |
| `SensorTask` | 2 | 1 | `src/sensors.cpp` | อ่านระยะ VL53L0X, การมีคนอยู่จาก PIR และกำลังไฟจาก INA219 ทุก 200 ms |
| `CloudTask` | 1 | 0 | `src/cloud.cpp` | Wi-Fi, MQTTS, เก็บแล้วส่งต่อ, state snapshot, คำสั่ง, AI, การแจ้งเตือน |
| `StatusLedTask` | 1 | 1 | `src/status_led.cpp` | LED RGB บนบอร์ด (WS2812 GPIO48): ขาวกะพริบครั้งเดียว=บูต, ขาวค่อยๆ สว่าง=กำลังต่อ Wi-Fi, แดง=ต่อ Wi-Fi ไม่ได้, ฟ้า=รอ NTP, เหลือง=รอ MQTT, ม่วงแดง=โหนดเงียบ, ม่วง=โหนดยังอยู่แต่ยังไม่มีค่าที่วัดได้, เขียว=ปกติ, น้ำเงิน=สถานะปลอดภัย |
| `loop()` | 1 | 1 | `src/main.cpp` | LED สถานะภายนอก GPIO2 (ติดค้าง = เชื่อมคลาวด์ได้, กะพริบ = ออฟไลน์) |

**เหตุผลของ priority:** ความปลอดภัยและการควบคุมต้องไม่รอเครือข่าย `ControlTask` จึงสูงสุด รองลงมาคือ `EspNowRxTask` เพื่อไม่ให้คิววิทยุ 32 ช่องล้น เซนเซอร์อ่านเป็นรอบและไม่เร่งด่วน ส่วนงานคลาวด์ (TLS, HTTP) อาจบล็อกได้หลายวินาที จึงต่ำสุดและแยกไปทำงานบน core 0 ตัวเดียว

**การสื่อสารระหว่าง task (E1):**

| กลไก | จาก → ไป | ข้อมูลที่ส่ง |
|---|---|---|
| คิว `qTelemetry` | callback ของ ESP-NOW → EspNowRxTask | แพ็กเก็ต `SdlTelemetry` |
| คิว `qNodeSys` | callback ของ ESP-NOW → EspNowRxTask | heartbeat `SdlSysStatus` |
| คิว `qCloud` | EspNowRxTask → CloudTask | ค่าที่อ่านใหม่ + เวลาที่ได้รับ |
| คิว `qCloudSys` | EspNowRxTask → CloudTask | heartbeat ของโหนด + เวลาที่ได้รับ |
| คิว `qControl` | ISR ปุ่มหยุด, CloudTask → ControlTask | หยุด, โหมด, feedback, โปรไฟล์ใหม่จาก AI |
| คิว `qAlerts` | ทุก task → CloudTask | ข้อความแจ้งเตือนสำหรับ Discord / MQTT |
| event group `events` | CloudTask ↔ task อื่น | Wi-Fi พร้อม, MQTT พร้อม, "ขอโปรไฟล์จาก AI" |
| mutex `stateMutex` | ทุก task | `app::state` ที่ใช้ร่วมกัน (ผ่าน `StateLock`) |

## ไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `src/config.h` | ขา, เวลา, ค่าเกนการควบคุม, topic ของ MQTT — แก้ค่าเหล่านี้ที่นี่ที่เดียว |
| `src/app.h/.cpp` | ชนิดข้อมูลที่ใช้ร่วมกัน, คิว, mutex, event group, `raiseAlert()` |
| `src/ca_bundle.h` | ผูก CA bundle ที่ฝังมากับ ESP32 เข้ากับ `WiFiClientSecure` (รองรับทั้ง core 2.x และ 3.x) |
| `src/ina219.h/.cpp` | **ไดรเวอร์ INA219 ที่เขียนเอง** ระดับรีจิสเตอร์ (E8) |
| `src/lamp.h/.cpp` | เซอร์โวฟิลเตอร์ (จำกัดมุม, จำกัดความถี่, timeout ปลด servo) และ PWM ของ LED |
| `src/espnow_link.h/.cpp` | รับ ESP-NOW + ตอบ ACK, ตารางโหนด, โหนดจำลอง |
| `src/sensors.h/.cpp` | SensorTask |
| `src/control.h/.cpp` | ControlTask, โปรไฟล์ตามกฎ, จำกัดค่าที่ได้จาก AI |
| `src/ai_client.h/.cpp` | ส่งคำขอไปยัง Gemini API และแปลง JSON |
| `src/cloud.h/.cpp` | CloudTask: MQTTS, backlog, state snapshot, คำสั่ง, Discord |
| `src/ring_buffer.h` | FIFO ขนาดคงที่สำหรับเก็บแล้วส่งต่อ |
| `src/status_led.h/.cpp` | LED RGB บนบอร์ด แสดงสถานะลิงก์และสถานะปลอดภัย |

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
| E4 Reliable comms | `espnow_link.cpp`, `cloud.cpp`, `ring_buffer.h` | ACK + ตัวนับแพ็กเก็ตซ้ำ; ถอด Wi-Fi แล้วค่าจะถูกเก็บในบัฟเฟอร์ (`buffered` ใน `@msg/sdl/gw/state`) จากนั้นส่งต่อตามลำดับ |
| E5 Security | `cloud.cpp` `ensureMqtt()`, `ca_bundle.h` | MQTTS พอร์ต 8883 ตรวจใบรับรองของ broker ด้วย CA bundle ที่ฝังมากับ ESP32 (`ca::useBuiltin()`) **ก่อน**ส่ง token; รอ NTP ให้ตรงก่อนทุกครั้งเพราะการตรวจลูกโซ่ใช้เวลาระบบ; ข้อมูลลับอยู่ใน `secrets.h` ที่ git ไม่ติดตามเท่านั้น |
| E8 Own driver | `ina219.cpp` | คณิตศาสตร์การ calibrate, การอ่านรีจิสเตอร์; เทียบกับมัลติมิเตอร์ / logic analyzer |

## การตั้งค่า

1. **บรอคเกอร์ MQTT:** โปรเจกต์ใช้ EMQX ที่รันเอง (`infra/docker-compose.yml`) มี NPMplus เป็นตัว terminate TLS ที่พอร์ต 8883 ตั้ง host ใน `cfg::kMqttHost` (`src/config.h`) และใส่ username / password ของ device ใน `include/secrets.h` (คัดลอกจาก `secrets.example.h`) — ตัวแปรยังใช้ชื่อ `NETPIE_TOKEN` / `NETPIE_SECRET` ตามของเดิม ส่วน client id คือ `cfg::kDeviceName` (`sdl-gateway`)
2. **ตรวจใบรับรอง (E5):** NPMplus ออกใบรับรองด้วย ACME ซึ่งต่อลูกโซ่ถึง root สาธารณะที่มีอยู่ใน CA bundle ที่ฝังมากับ Arduino core เฟิร์มแวร์จึงเรียก `ca::useBuiltin()` ไม่ต้องมีไฟล์ PEM หรือ pin fingerprint ตรวจเองได้ด้วย
   `openssl s_client -connect gw.embed.rachatat.com:8883 -servername gw.embed.rachatat.com </dev/null | openssl x509 -noout -issuer`
   การตรวจลูกโซ่ใช้เวลาระบบเทียบวันหมดอายุ เกตเวย์จึงรอ NTP ซิงก์สำเร็จก่อนเปิด TLS ทุกครั้ง (ถ้าไม่สำเร็จใน 60 วินาทีจะตั้ง SNTP ใหม่)
3. **AI:** ใส่ Gemini API key ใน `LLM_API_KEY` (เว้นว่าง = ใช้โปรไฟล์ตามกฎอย่างเดียว) ชื่อโมเดลอยู่ที่ `cfg::kAiModel`
4. **Discord:** สร้าง webhook ของช่องแชตแล้วใส่ URL ใน `DISCORD_WEBHOOK`
5. **โหนดเซนเซอร์:** ไม่ต้องตั้ง MAC หรือช่อง Wi-Fi ของเกตเวย์ล่วงหน้า โหนดจะ broadcast heartbeat ไล่ช่อง 1–13 หาเกตเวย์ เรียนรู้ MAC จาก ACK แล้วสลับเป็น unicast และสแกนใหม่เองถ้าเงียบเกิน 15 วินาที (รายละเอียดใน `docs/protocols.md`)
6. บิลด์และแฟลช: `pio run -d firmware/gateway -t upload && pio device monitor -d firmware/gateway`

**หมายเหตุ TLS:** ทุกปลายทาง (EMQX 8883, Gemini, Discord) ตรวจใบรับรองด้วย CA bundle ที่ฝังมากับ ESP32 ไม่มีการเรียก `setInsecure()` ในบิลด์ปกติ สำหรับการดีบักบนเครื่องตัวเองเท่านั้นที่บิลด์ด้วย `-DALLOW_INSECURE_TLS` เพื่อข้ามการตรวจ — ห้ามใช้ในการเดโม

### Topic ของ MQTT

| Topic | ทิศทาง | ข้อมูล |
|---|---|---|
| `@msg/sdl/gw/telemetry` | เกตเวย์ → คลาวด์ ทุก 2 วินาที | สถานะเกตเวย์: `uptime_s, wifi_up, wifi_code, rssi, wifi_ch, ip, wifi_retries, mqtt_fails, ntp, time, heap, heap_min, temp_c, reset, nodes, mode, safe, pwm, buffered, dropped` |
| `@msg/sdl/sensor/telemetry` | เกตเวย์ → คลาวด์ ทุก heartbeat (2 วินาที) และทุกชุดค่าที่อ่านได้ | heartbeat: `node_id, seq, ts, node_ms, uptime_s, heap, heap_min, wifi_ch, reset, temp_c, tx_acked, tx_attempts`; เมื่อไดรเวอร์เซนเซอร์เสร็จจะเพิ่ม `lux, r, g, b, c, cct` โดย `node_id` (`N1`, `N2`, …) บอกว่าเป็นโหนดไหน |
| `@msg/sdl/gw/state` | เกตเวย์ → คลาวด์ ทุก 30 วินาที | snapshot ล่าสุดของทุกอย่าง: `n1_lux, n1_cct, n1_up_s, n1_heap, n1_temp_c, n1_sys_age_s, n1_rx, n1_seq, dist_mm, presence, lamp_mW, diffuser, nd, warm, pwm, safe, mode, target_lux, ai, buffered, dropped, heap, uptime_s, device` |
| `@msg/sdl/cmd` | แดชบอร์ด → เกตเวย์ | `{"mode":"coding"}` หรือ `{"feedback":"too_bright"}` / `"too_dim"` |
| `@msg/sdl/alert` | เกตเวย์ → คลาวด์ | ข้อความแจ้งเตือน (ส่งเข้า Discord ด้วย) |
| `@msg/sdl/gateway/status` | เกตเวย์ → คลาวด์ (retained) | `"online"` / `"offline"` — `online` ส่งตอนเชื่อมต่อสำเร็จ ส่วน `offline` เป็น MQTT Last Will ที่ broker ส่งแทนเมื่อเกตเวย์ขาดการเชื่อมต่อเกิน keepalive 30 วินาที แดชบอร์ดจึงรู้สถานะลิงก์ทันทีที่ subscribe |
| `@msg/sdl/sensor/status` | เกตเวย์ → คลาวด์ (retained) | presence ของโหนด: `{"ts":…,"N1":"online"}` — เขียนแทนโหนดที่ไม่มี MQTT session; `online` เมื่อมี heartbeat/ค่าที่วัดได้ภายใน 10 วินาที, `offline` เมื่อเงียบกว่านั้น; เขียนซ้ำเมื่อเปลี่ยน, ตอนเชื่อมต่อใหม่ และทุก 30 วินาที |

ทั้งหมดเป็น topic MQTT ธรรมดาบน EMQX ของเรา (`@` นำหน้าได้ตามสเปก) จึงไม่ต้องลงทะเบียน alias แบบ NETPIE อีก จำไว้ว่า compose เปิดเฉพาะ 1883 บน loopback — client ภายนอกต้องผ่าน NPMplus ที่พอร์ต 8883 (TLS) หรือ wss

เฟิร์มแวร์ publish ด้วย QoS 0 และ retain เฉพาะ `@msg/sdl/gateway/status` กับ `@msg/sdl/sensor/status`; heartbeat ของโหนดไม่ได้ถูกเก็บย้อนหลังตอนออฟไลน์ (ค่าล่าสุดยังอยู่ใน `@msg/sdl/gw/state`)

### ตัวชี้วัดที่อ่านได้จาก state snapshot

- **อัตราการส่งแพ็กเก็ตสำเร็จ:** `n1_rx / n1_seq` (จำนวนแพ็กเก็ต telemetry ไม่ซ้ำที่ได้รับ ÷ seq ล่าสุดของโหนด) และดู `tx_acked / tx_attempts` จาก heartbeat ของโหนดเอง
- **Uptime:** `uptime_s`; **กำลังไฟแต่ละโหมด:** `lamp_mW` คู่กับ `mode`, `pwm` และฟิลด์ฟิลเตอร์
- **เก็บแล้วส่งต่อ:** `buffered` เพิ่มขึ้นขณะออฟไลน์ และลดลงเหลือ 0 หลังเชื่อมต่อได้อีกครั้ง ส่วน `dropped` ต้องเป็น 0 เมื่อขาดการเชื่อมต่อไม่เกินราว 5 นาที

### ทดสอบการขยายระบบ

ตั้ง `cfg::kSimulatedNodes = 2` ใน `config.h` เพื่อเพิ่มโหนดจำลอง 101 และ 102 คู่กับโหนดจริง 1 ทุกโหนดใช้ `@msg/sdl/sensor/telemetry` ร่วมกันและแยกด้วย `node_id` ส่วน snapshot จะมีฟิลด์ `n<id>_*` ของแต่ละโหนด
