#include "control.h"

#include <time.h>

#include "lamp.h"

namespace control {
namespace {

float clampf(float v, float lo, float hi) { return v < lo ? lo : (v > hi ? hi : v); }

int currentHour() {
  if (!app::nowEpoch()) return 12;  // unknown time -> assume daytime
  time_t t = time(nullptr);
  struct tm local;
  localtime_r(&t, &local);
  return local.tm_hour;
}

void pushFeedback(int8_t fb) {
  auto &s = app::state;
  for (int i = cfg::kFeedbackHistory - 1; i > 0; i--) s.feedback[i] = s.feedback[i - 1];
  s.feedback[0] = fb;
  if (s.feedbackCount < cfg::kFeedbackHistory) s.feedbackCount++;
}

struct Readings {
  bool nodeFresh;
  float lux;
  bool someoneThere;
};

Readings snapshot() {
  app::StateLock lock;
  Readings r{false, 0, true};
  uint32_t now = millis();
  for (const auto &n : app::state.nodes) {
    if (n.used && n.id == cfg::kPrimaryNodeId) {
      r.nodeFresh = now - n.lastSeenMs < cfg::kNodeStaleMs;
      r.lux = n.lux;
    }
  }
  const auto &l = app::state.local;
  r.someoneThere = l.lastPresenceMs == 0 /* PIR never fired yet */ ||
                   now - l.lastPresenceMs < cfg::kPresenceTimeoutMs;
  return r;
}

void handleEvent(const app::ControlEvent &ev) {
  switch (ev.type) {
    case app::EventType::StopButton: {
      bool nowSafe;
      {
        app::StateLock lock;
        app::state.lamp.safe = !app::state.lamp.safe;
        nowSafe = app::state.lamp.safe;
      }
      if (nowSafe) {
        lamp::enterSafeState();
        app::raiseAlert("Stop button pressed: lamp in safe state");
      } else {
        app::raiseAlert("Stop released: automatic control resumed");
        app::requestAiProfile();
      }
      break;
    }
    case app::EventType::SetMode: {
      app::StateLock lock;
      app::state.mode = ev.mode;
      app::state.profile = ruleProfile(ev.mode, currentHour());  // respond at once
      app::requestAiProfile();                                    // refine with AI
      Serial.printf("[control] mode -> %s\n", app::modeName(ev.mode));
      break;
    }
    case app::EventType::Feedback: {
      app::StateLock lock;
      pushFeedback(ev.feedback);
      auto &p = app::state.profile;
      p.targetLux = clampf(p.targetLux * (1.0f - ev.feedback * cfg::kFeedbackStep),
                           cfg::kMinTargetLux, cfg::kMaxTargetLux);
      app::requestAiProfile();
      Serial.printf("[control] feedback %+d -> target %.0f lux\n", ev.feedback, p.targetLux);
      break;
    }
    case app::EventType::NewProfile: {
      app::StateLock lock;
      app::state.profile = sanitize(ev.profile);
      Serial.printf("[control] new profile %.0f lux %u K filters %d%d%d (%s)\n",
                    app::state.profile.targetLux, app::state.profile.targetCct,
                    app::state.profile.filters[0], app::state.profile.filters[1],
                    app::state.profile.filters[2], ev.profile.fromAi ? "AI" : "rules");
      break;
    }
  }
}

}  // namespace

app::Profile ruleProfile(app::Mode mode, int hourOfDay) {
  app::Profile p;
  switch (mode) {
    case app::Mode::Coding:  // lower desk lux, diffuser + ND to cut glare next to a screen
      p.targetLux = 300; p.targetCct = 4500;
      p.filters[0] = true; p.filters[1] = true; p.filters[2] = false;
      break;
    case app::Mode::Drawing:  // bright, neutral light for colour work
      p.targetLux = 700; p.targetCct = 5000;
      p.filters[0] = true; p.filters[1] = false; p.filters[2] = false;
      break;
    default:  // Reading: ~500 lux (EN 12464-1 reading/writing)
      p.targetLux = 500; p.targetCct = 4000;
      p.filters[0] = true; p.filters[1] = false; p.filters[2] = false;
      break;
  }
  if (hourOfDay >= 20 || hourOfDay < 6) {  // evening: warmer light
    p.filters[2] = true;
    p.targetCct = 3000;
  }
  p.fromAi = false;
  return p;
}

app::Profile sanitize(const app::Profile &in) {
  app::Profile p = in;
  p.targetLux = clampf(p.targetLux, cfg::kMinTargetLux, cfg::kMaxTargetLux);
  if (p.targetCct < 2500 || p.targetCct > 6500) p.targetCct = 4000;
  return p;
}

void task(void *) {
  {
    app::StateLock lock;
    app::state.profile = ruleProfile(app::state.mode, currentHour());
  }
  bool sensorFault = false;
  bool away = false;
  float pwmAcc = 0;  // fractional PWM so small corrections accumulate

  for (;;) {
    // Wait up to one control period for events; this is also the loop's timing.
    app::ControlEvent ev;
    if (xQueueReceive(app::qControl, &ev, pdMS_TO_TICKS(cfg::kControlPeriodMs)) == pdTRUE) {
      handleEvent(ev);
      while (xQueueReceive(app::qControl, &ev, 0) == pdTRUE) handleEvent(ev);
    }

    bool safe;
    app::Profile profile;
    {
      app::StateLock lock;
      safe = app::state.lamp.safe;
      profile = app::state.profile;
    }
    if (safe) {
      lamp::service();
      continue;
    }

    Readings r = snapshot();

    // ---- sensor fault: the loop has no feedback, so stop moving and hold medium light
    if (!r.nodeFresh) {
      if (!sensorFault) {
        sensorFault = true;
        lamp::enterSafeState();
        pwmAcc = lamp::pwm();
        app::raiseAlert("No data from sensor node %u: holding safe brightness", cfg::kPrimaryNodeId);
      }
      lamp::service();
      continue;
    }
    if (sensorFault) {
      sensorFault = false;
      app::raiseAlert("Sensor node %u back: closed loop resumed", cfg::kPrimaryNodeId);
    }

    // ---- nobody at the desk: switch the light off, ask the AI again when they return
    if (!r.someoneThere) {
      if (!away) {
        away = true;
        lamp::setPwm(0);
        pwmAcc = 0;
        Serial.println("[control] desk empty -> lamp off");
      }
      lamp::service();
      continue;
    }
    if (away) {
      away = false;
      app::requestAiProfile();
    }

    // ---- closed loop: proportional step on PWM, filters from the profile
    lamp::setFilters(profile.filters);  // rate-limited inside
    if (static_cast<uint8_t>(pwmAcc + 0.5f) != lamp::pwm()) pwmAcc = lamp::pwm();  // after safe/away

    float error = profile.targetLux - r.lux;
    float tolerance = cfg::kLuxTolerance * profile.targetLux;
    if (fabsf(error) > tolerance) {
      pwmAcc += clampf(cfg::kKp * error, -cfg::kMaxPwmStep, cfg::kMaxPwmStep);
      pwmAcc = clampf(pwmAcc, 0, 255);
      lamp::setPwm(static_cast<uint8_t>(pwmAcc + 0.5f));

      // PWM saturated but still off target: change the ND filter (a physical move).
      bool wantNd = profile.filters[lamp::kNd];
      if (lamp::pwm() >= 250 && error > tolerance && wantNd) wantNd = false;
      if (lamp::pwm() <= 5 && error < -tolerance && !wantNd) wantNd = true;
      if (wantNd != profile.filters[lamp::kNd]) {
        app::StateLock lock;
        app::state.profile.filters[lamp::kNd] = wantNd;
      }
    }

    {
      app::StateLock lock;
      auto &l = app::state.lamp;
      for (int i = 0; i < 3; i++) l.filters[i] = lamp::filters()[i];
      l.pwm = lamp::pwm();
    }
    lamp::service();
  }
}

}  // namespace control
