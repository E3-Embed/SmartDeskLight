// AI component (M4): asks an LLM for a lighting profile over HTTPS.
// The answer is only a suggestion: ControlTask clamps it (control::sanitize) and the
// closed loop on measured lux decides the final PWM.
#pragma once
#include "app.h"

namespace ai {

struct Context {
  float lux;
  uint16_t cct;
  uint16_t distMm;
  bool presence;
  app::Mode mode;
  bool filters[3];
  uint8_t pwm;
  int hour;
  int8_t feedback[cfg::kFeedbackHistory];
  uint8_t feedbackCount;
};

// Blocking HTTPS call (a few seconds). Returns false on any network / parse error;
// the caller then keeps the rule-based profile.
bool requestProfile(const Context &ctx, app::Profile &out);

}  // namespace ai
