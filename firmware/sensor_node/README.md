# Sensor Node — งานของฐากูร นันตสุวรรณ

## ขอบเขตและโค้ดที่เตรียม

- `src/sensors.cpp`: ไดรเวอร์ I2C ระดับรีจิสเตอร์ของ BH1750 และ TCS34725
- BH1750: power-on/reset/continuous high-resolution, รอ conversion โดยจับเวลา, แปลง raw / 1.2 เป็น lux
- TCS34725: ตรวจ ID, integration 100.8 ms / gain 16x, เว้น PON ก่อน AEN, ตรวจ AVALID แล้วอ่าน RGBC แบบ burst
- CCT: ประมาณแบบ DN40 พร้อม IR correction; 0 หมายถึงไม่มีค่าที่เชื่อถือได้ เช่น มืด/อิ่มตัว ไม่ใช่อุณหภูมิ 0 Kelvin
- การรอ conversion ไม่ใช้ delay(); จำกัด I2C timeout ต่อ transaction ที่ 5 ms และเส้นทางยาวสุดใน read() ไม่เกินงบ 50 ms ตามการตั้งค่า
- อ่าน BH1750 ได้แม้ TCS34725 ยังไม่ต่อ; ไม่ส่ง telemetry ถ้าอ่าน BH1750 ไม่สำเร็จ เพื่อไม่ให้ Gateway เข้าใจว่าห้องมืดจริง
- ค่าศูนย์ lux ที่อ่านสำเร็จเป็นค่าที่ถูกต้อง; ค่าล้น 0xFFFF จะไม่ส่งเป็น lux
- ถ้า I2C ขาดหายจะหยุดใช้ค่าครั้งเก่า และตรวจหา/เริ่มต้นใหม่ผ่าน presence probe ทุก 3 วินาที
- `src/main.cpp`: ส่ง SdlTelemetry ประมาณทุก 1 วินาทีเมื่อมีค่าจริง และ heartbeat ทุก 2 วินาที
- คง message.h เวอร์ชัน 1 และโค้ด ACK ของทีม: รอ 100 ms ต่อครั้ง, ส่งครั้งแรก + ส่งซ้ำได้ 3 ครั้ง โดยใช้ seq และ payload เดิม
- ค้นหา MAC/channel ของ Gateway อัตโนมัติด้วย broadcast ช่อง 1–13 และเรียนรู้จาก ACK; ไม่ต้องกรอก MAC เอง
- ไม่ส่งค่าระยะ/PIR กลับ Node เพราะ protocol ปัจจุบันกำหนดให้ Gateway อ่านค่านั้นเอง

## บอร์ดและการต่อ

ใช้ ESP32-S3 DevKitC-1; บอร์ดจริงที่ใช้ทดสอบเป็น N16R8

| สัญญาณโมดูล | ขาบอร์ด Sensor |
|---|---|
| BH1750 VCC | 3V3 |
| BH1750 GND | GND |
| BH1750 DAT/SDA | GPIO8 |
| BH1750 SCL | GPIO9 |
| BH1750 ADDR | GND เพื่อใช้ 0x23 |
| TCS34725 SDA | GPIO8 ร่วมกับ BH1750 |
| TCS34725 SCL | GPIO9 ร่วมกับ BH1750 |
| TCS34725 GND | GND ร่วมกับบอร์ด |
| TCS34725 ไฟเลี้ยง | ตรวจชื่อรุ่น/ขาโมดูลจริงก่อนต่อ; ใช้โมดูลที่รองรับไฟและ I2C 3.3V |

ดูชื่อขาที่โมดูลเป็นหลัก สีสายต่อพ่วงอาจเปลี่ยนได้ ไม่ควรจำสีแทนขา
TCS34725 กับ VL53L0X ใช้ address 0x29 เหมือนกัน แต่ไม่ชนกัน เพราะอยู่คนละบอร์ด/บัส
Node กับ Gateway ไม่ต้องต่อสายสื่อสารหากัน ทั้งสองบอร์ดมีไฟเลี้ยงของตัวเอง

## Build และอัปโหลด (แยกจากการทดสอบจริง)

```powershell
pio run -d firmware/sensor_node
pio run -d firmware/gateway
pio run -d firmware/sensor_node -t upload --upload-port <พอร์ตของ Sensor>
pio device monitor -b 115200 --port <พอร์ตของ Sensor>
```

Node ตั้ง ARDUINO_USB_CDC_ON_BOOT=1 จึงดู Serial ผ่านช่อง USB ของ ESP32-S3 โดยตรง
Gateway ปัจจุบันแสดง Serial ผ่าน USB-to-UART อีกช่องบนบอร์ด ให้ตรวจพอร์ต/หมายเลขบอร์ดก่อนอัปโหลดเสมอ
Node ที่ใช้ทดสอบมี MAC 98:C3:77:A0:42:40; Gateway มี MAC 30:ED:A0:A8:A6:0C
COM อาจเปลี่ยนเมื่อสลับช่อง USB หรือต่อบอร์ดใหม่

ตัวอย่างข้อความจาก Node หลังอัปโหลดไดรเวอร์ใหม่ (เป็นตัวอย่าง ไม่ใช่ผลวัดจริง):

```text
[sensor] seq=42 lux=412.50 r=1000 g=1500 b=1200 c=4000 cct=5963 tcs_ok=1 ack=1
```

`ack=1` ยืนยันว่า Gateway ตอบรับแพ็กเก็ตนั้น, `tcs_ok=0` หมายถึงรอบนั้นไม่มีข้อมูลสีที่อ่านสำเร็จ
แพ็กเก็ตเวอร์ชันปัจจุบันไม่มี validity flag แยกสำหรับสี จึงส่ง r/g/b/c/cct เป็น 0 เมื่อสีไม่พร้อม
ห้ามนำเลข 0 ใน cct ไปตีความเป็นอุณหภูมิสีจริง

## โหมดทดสอบ Gateway กับการใช้งานจริง

ใน `firmware/gateway/src/config.h` มี `kLocalLinkTest`:

- `false` (ค่าเริ่มต้นใน source): ใช้ Wi-Fi/Cloud ของระบบตาม secrets.h และใช้ช่องของ Hotspot
- `true`: ทดสอบ ESP-NOW โดยไม่ต้องมี Hotspot, ใช้ kLocalLinkChannel=1, ไม่เริ่ม CloudTask

การเปลี่ยน source จะมีผลบนบอร์ดเมื่ออัปโหลดใหม่เท่านั้น
เฟิร์มแวร์ Gateway ที่ใช้ยืนยัน heartbeat ครั้งล่าสุดเป็นโหมด local test
เมื่อกลับไปใช้ Hotspot ของเพื่อน ให้ใช้ false และอัปโหลด Gateway ใหม่
Node ค้นหาช่องใหม่เอง จึงไม่ต้องฝัง MAC/channel ของเพื่อนไว้ใน Node
ห้าม commit secrets.h หรือคัดลอก key ลงรายงาน

## การตรวจด้วยคอมพิวเตอร์

```powershell
./tests/sensor_node_host/run.ps1
```

บน Windows ใช้ MSVC อัตโนมัติถ้าพบ หรือ `-Compiler g++`
ชุดทดสอบคอมไพล์ production sensors.cpp และ main.cpp ปัจจุบัน กับ mocks สำหรับ API Arduino 2.x / 3.x
ครอบคลุมการถอด/คืนเซนเซอร์, เหลือเซนเซอร์เดียว, มืด/อิ่มตัว, ID ผิด, อ่านไม่ครบ, AVALID, PON timing,
งบเวลา I2C, millis rollover, ACK ผิด MAC/version/type/node/seq/size, ส่งซ้ำ 4 ครั้งรวม 400 ms,
ค้นหา channel, และไม่ส่ง lux ปลอมจาก loop จริง
CI เพิ่ม job นี้แล้ว แต่ยังไม่ได้ push หรืออ้างว่า CI บน GitHub ผ่าน

ผลทดสอบบนบอร์ดจริงและรายการที่ยังไม่ทำ แยกไว้ใน [tests/sensor_node_hardware.md](../../tests/sensor_node_hardware.md)

## เอกสารอ้างอิงสำหรับตรวจรีจิสเตอร์

- BH1750 (เอกสาร ROHM): https://cdn.velleman.eu/downloads/29/infosheets/bh1750fvi-e_datasheet.pdf
- TCS3472 (ams OSRAM): https://look.ams-osram.com/m/7ec5bcc3e40679be/original/TCS3472-DS000390.pdf
- DN40 calculation reference: https://github.com/adafruit/Adafruit_TCS34725/blob/master/Adafruit_TCS34725.cpp
