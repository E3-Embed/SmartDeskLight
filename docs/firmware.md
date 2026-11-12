# เฟิร์มแวร์

## งานของเกตเวย์ (FreeRTOS)

| งาน | Priority | หน้าที่ |
|---|:-:|---|
| `ControlTask` | 4 | ความปลอดภัย, เหตุการณ์ปุ่มหยุด, ควบคุมฟิลเตอร์และ PWM แบบวงปิด |
| `EspNowRxTask` | 3 | ดึงแพ็กเก็ตที่ได้รับ, ตัดแพ็กเก็ตซ้ำ, เก็บสถานะของแต่ละโหนด |
| `SensorTask` | 2 | VL53L0X, PIR, INA219 |
| `CloudTask` | 1 | MQTTS, บัฟเฟอร์เก็บแล้วส่งต่อ, คำขอไปยัง AI, การแจ้งเตือนผ่าน Discord |

ISR และ callback ของ ESP-NOW ทำแค่ใส่งานลงคิว งานอื่นทั้งหมดทำใน task

## Embedded Engineering Depth

| หัวข้อ | วิธีที่ทำ | สถานะ |
|---|---|:-:|
| **E1** RTOS multitasking | 4 task ที่กำหนด priority อย่างมีเหตุผล พร้อม queue และ event group | 🟡 วางโครงแล้ว |
| **E2** Interrupt-driven I/O | ISR ของปุ่มหยุด → `xQueueSendFromISR` → `ControlTask` | 🟡 วางโครงแล้ว |
| **E4** Reliable communication | seq + ACK/ส่งซ้ำ ระหว่างโหนดกับเกตเวย์, ring buffer ขณะออฟไลน์ | 🟡 วางโครงแล้ว |
| **E5** Security | MQTTS ตรวจ CA + device token, HTTPS ไปยัง AI/Discord, ข้อมูลลับไม่อยู่ใน git | ⚪ วางแผนไว้ |
| **E8** Low-level driver | ไดรเวอร์ I²C ระดับรีจิสเตอร์ที่เขียนเองสำหรับ BH1750, TCS34725 และ INA219 | ⚪ วางแผนไว้ |

---

[← กลับไปที่ README](../README.md)
