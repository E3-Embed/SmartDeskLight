# การตั้งค่า NETPIE2020

- **Project / Group:** `SmartDeskLight` / `sdl-group`
- **Device:** `gateway` สำหรับเฟิร์มแวร์เกตเวย์ (Client ID, Token และ Secret ใส่ใน `secrets.h`) และ `dashboard` สำหรับฝั่งแดชบอร์ดที่ส่งคำสั่ง
- **ฟิลด์ใน Shadow ต่อโหนด:** `n1_lux`, `n1_cct`, `n2_lux`, ... และ `dist_mm`, `presence`, `lamp_mW`, `diffuser`, `nd`, `warm`, `pwm`, `mode`
- **Feed:** เปิด datatag ของฟิลด์ใน Shadow (ข้อมูลอนุกรมเวลาดิบ ส่งออกเป็น CSV เพื่อคำนวณตัวชี้วัด) — ตอนนี้เปิดไว้ 8 ฟิลด์: `n1_lux`, `n1_cct`, `lamp_mW`, `pwm`, `target_lux`, `dist_mm`, `presence`, `buffered`
- **วิดเจ็ตบนแดชบอร์ด:** กราฟ lux / CCT / กำลังไฟ, สถานะฟิลเตอร์, สถานะแต่ละโหนด, ปุ่มเลือกกิจกรรม และปุ่ม feedback (สว่างเกินไป / มืดเกินไป) → `@msg/sdl/cmd`
- **Trigger:** Device Status Changed → Event Hook (แจ้งเตือนเมื่อเกตเวย์ออฟไลน์)
