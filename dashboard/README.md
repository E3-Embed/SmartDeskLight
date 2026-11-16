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
