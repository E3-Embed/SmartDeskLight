// ControlTask: closed-loop lighting control (highest-priority task).
#pragma once
#include "app.h"

namespace control {

// Rule-based profile used until the AI answers, and whenever the AI is unreachable.
app::Profile ruleProfile(app::Mode mode, int hourOfDay);

// Clamps an AI profile to safe, physically sensible values.
app::Profile sanitize(const app::Profile &p);

void task(void *);

}  // namespace control
