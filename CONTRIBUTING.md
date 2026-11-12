# แนวทางการร่วมพัฒนา

สมาชิกทุกคนต้องมี commit ของตัวเองใน repository นี้ (ข้อกำหนดรายวิชา M8) จึงขอให้ทำงานผ่าน branch และ pull request แทนการแก้ `main` โดยตรง

## ขั้นตอนการทำงาน

1. เลือกหรือสร้าง issue แล้ว assign ให้ตัวเอง
2. สร้าง branch จาก `main`:
   - `feat/<ชื่อสั้นๆ>` — ฟีเจอร์ใหม่ (เช่น `feat/bh1750-driver`)
   - `fix/<ชื่อสั้นๆ>` — แก้บั๊ก
   - `docs/<ชื่อสั้นๆ>` — เอกสาร / เนื้อหาสำหรับรายงาน
   - `test/<ชื่อสั้นๆ>` — สคริปต์ทดสอบและข้อมูลที่วัดได้
3. commit การเปลี่ยนแปลงทีละส่วนเล็กๆ ที่มีจุดประสงค์ชัดเจน (ดูรูปแบบข้อความด้านล่าง)
4. ตรวจให้แน่ใจว่าเฟิร์มแวร์ทั้งสองโปรเจกต์บิลด์ผ่าน: `pio run -d firmware/sensor_node` และ `pio run -d firmware/gateway`
5. เปิด pull request กรอก template ลิงก์ issue (`Closes #12`) และขอให้เพื่อนในทีมหนึ่งคนรีวิว
6. merge หลังได้รับการรีวิวและ CI ผ่าน (สีเขียว) แล้วลบ branch ทิ้ง

## ข้อความ commit

ใช้รูปแบบ [Conventional Commits](https://www.conventionalcommits.org/) (เขียนข้อความ commit เป็นภาษาอังกฤษ):

```
feat(gateway): add MQTTS connection to NETPIE
fix(node): retry ESP-NOW send when ACK times out
docs: add wiring diagram for servo rail
test: log packet delivery rate over 1 h
```

scope ที่ใช้ได้: `node`, `gateway`, `common`, `dashboard`, `docs`, `tests`, `ci`

## รูปแบบโค้ด

- จัดรูปแบบโค้ด C/C++ ด้วย `.clang-format` (รัน `clang-format -i <ไฟล์>` หรือเปิด format-on-save ใน VS Code)
- ห้ามทำงานที่บล็อกภายใน ISR หรือ callback ของ ESP-NOW — ให้ใส่คิวแล้ว return ทันที
- เก็บหมายเลขขาไว้ที่เดียว (ดูผังขาใน [docs/hardware.md](docs/hardware.md))
- ค่าคงที่ใหม่ให้ใช้ `constexpr` / `static const` แทน `#define`

## ข้อมูลลับ

ห้าม commit รหัส Wi-Fi, token ของ NETPIE, API key หรือ URL ของ webhook เด็ดขาด ให้ใส่ไว้ใน `firmware/gateway/include/secrets.h` (git ไม่ติดตามไฟล์นี้) และอัปเดต `secrets.example.h` ด้วยค่าตัวอย่างเสมอ หากเผลอ commit ข้อมูลลับไปแล้ว ให้เปลี่ยนคีย์นั้นทันที — การลบ commit อย่างเดียวไม่พอ

## ผู้รับผิดชอบ

| ส่วนงาน | ผู้รับผิดชอบ |
|---|---|
| รูปแบบข้อความ การรวมระบบ และ AI | รชาทัช บุญพัฒน์ |
| `firmware/sensor_node`, ไดรเวอร์ BH1750 | ฐากูร นันตสุวรรณ |
| `firmware/gateway`, NETPIE, ไดรเวอร์ INA219 | นรินธร ยางงาม |
| `dashboard/`, การแจ้งเตือนผ่าน Discord | ปุณยวีร์ พัฒนประดิษฐ์ |
| `tests/`, ไทม์ไลน์, กลไกฟิลเตอร์ | กษิดิศ ประจงการ |
