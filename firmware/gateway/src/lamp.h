// Lamp actuation: three servo-driven flip filters + LED PWM.
// Only ControlTask calls these functions (single owner, no locking needed inside).
#pragma once
#include <stdint.h>

namespace lamp {

enum Filter : uint8_t { kDiffuser = 0, kNd = 1, kWarm = 2 };

void begin();

// Moves the filters to `want`. Rate-limited to one change per kServoMinIntervalMs
// unless `force` is set (safe state). Returns true if any servo moved.
bool setFilters(const bool want[3], bool force = false);

void setPwm(uint8_t duty);
uint8_t pwm();
const bool *filters();

// Folds all filters out and sets the LED to medium brightness.
void enterSafeState();

// Call every control period: detaches servos once they had time to reach position
// (acts as a move timeout and stops SG90 jitter / holding current).
void service();

}  // namespace lamp
