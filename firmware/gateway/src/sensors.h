// Gateway's own sensors: VL53L0X (distance), PIR (presence), INA219 (lamp power).
// SensorTask is the only user of the I2C bus on the gateway.
#pragma once

namespace sensors {

void begin();
void task(void *);

}  // namespace sensors
