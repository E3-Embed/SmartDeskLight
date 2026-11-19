#include "sensors.h"

#include <VL53L0X.h>
#include <Wire.h>

#include "app.h"
#include "ina219.h"

// SensorTask owns the gateway's I2C bus. Every sensor is polled on one fixed cadence so a
// stalled part cannot hold the other two hostage: VL53L0X continuous mode with a short
// timeout, PIR debounced in software, INA219 read and integrated into energy.
//
// A sensor that is absent at boot (or stops answering) is retried every kSensorRetryMs,
// which is what makes "unplug it and plug it back in" recover without a reboot.
namespace sensors {
namespace {

VL53L0X tof;
Ina219 ina(Wire);

bool tofReady = false;
bool inaReady = false;
bool tofMissingAlerted = false;
bool inaMissingAlerted = false;
uint32_t lastTofTryMs = 0;
uint32_t lastInaTryMs = 0;
uint8_t tofFails = 0;
uint8_t inaFails = 0;

// PIR: HIGH must persist for kPirConfirmMs, then presence is held for kPirHoldMs so the
// HC-SR501's own retrigger gap does not look like someone leaving.
bool pirHighLatch = false;
uint32_t pirHighSinceMs = 0;
uint32_t pirLastHighMs = 0;
bool pirPresent = false;
// Raw level as last sampled, plus edge counters, so the serial log can tell "never moves"
// (wiring / power / sensitivity pots) from "moves but is filtered out" (thresholds).
bool pirRaw = false;
bool pirRawPrev = false;
uint32_t pirRisingEdges = 0;
uint32_t pirHighMsTotal = 0;
uint32_t lastPirDebugMs = 0;

// VL53L0X: a person closer than kPresenceDistanceMm, confirmed and then held briefly so a
// hand or a book crossing the beam does not flap presence.
bool tofCloseLatch = false;
uint32_t tofCloseSinceMs = 0;
uint32_t tofLastCloseMs = 0;
bool tofPresent = false;

uint32_t lastEnergyMs = 0;

bool initTof() {
  tof.setBus(&Wire);
  tof.setTimeout(50);  // ms; a missing part must not block the 200 ms loop
  if (!tof.init()) return false;
  tof.setMeasurementTimingBudget(33000);  // 33 ms is the library default; make it explicit
  tof.startContinuous(100);               // a fresh range every 100 ms
  return true;
}

bool initIna() { return ina.begin(cfg::kInaShuntOhms, cfg::kInaMaxCurrentA); }

// Same wording the cloud publishes in presence_src, so the serial log and the dashboard agree.
const char *presenceSourceName(uint8_t src) {
  const bool pir = (src & app::kPresencePir) != 0;
  const bool tof = (src & app::kPresenceToF) != 0;
  if (pir && tof) return "pir+tof";
  if (pir) return "pir";
  if (tof) return "tof";
  return "none";
}

// Debounces the PIR output and updates pirPresent.
void readPir(uint32_t now) {
  const bool raw = digitalRead(cfg::kPinPir) == HIGH;

  if (cfg::kSensorDebug) {
    if (raw != pirRawPrev) {
      Serial.printf("[pir] raw %d->%d at %lu ms\n", pirRawPrev ? 1 : 0, raw ? 1 : 0,
                    static_cast<unsigned long>(now));
      if (raw) pirRisingEdges++;
    }
    if (raw) pirHighMsTotal += cfg::kSensorPeriodMs;
  }
  pirRawPrev = raw;
  pirRaw = raw;

  // HC-SR501 needs 30-60 s after power-up; its output can bounce before that. Ignore it,
  // and let the boot grace in ControlTask plus the distance sensor cover the warm-up.
  const bool high = now >= cfg::kPirWarmupMs && raw;

  if (high) {
    if (!pirHighLatch) {
      pirHighLatch = true;
      pirHighSinceMs = now;
    }
    if (now - pirHighSinceMs >= cfg::kPirConfirmMs) {
      pirPresent = true;
      pirLastHighMs = now;
    }
  } else {
    pirHighLatch = false;
  }

  if (pirPresent && now - pirLastHighMs > cfg::kPirHoldMs) pirPresent = false;
}

// Returns true when a valid target was measured. Also updates tofPresent.
bool readTof(uint32_t now, uint16_t &mm) {
  if (!tofReady) {
    tofCloseLatch = false;
    if (tofPresent && now - tofLastCloseMs > cfg::kDistanceHoldMs) tofPresent = false;
    return false;
  }

  mm = tof.readRangeContinuousMillimeters();
  const bool timedOut = tof.timeoutOccurred();
  const bool valid = !timedOut && mm >= 30 && mm <= cfg::kDistanceValidMaxMm;

  if (timedOut) {
    if (++tofFails >= cfg::kSensorFailLimit) {
      tofFails = 0;
      tofReady = false;
      tofMissingAlerted = true;
      tof.stopContinuous();
      app::raiseAlert("VL53L0X stopped answering: re-initialising");
    }
  } else {
    tofFails = 0;
  }

  if (valid && mm <= cfg::kPresenceDistanceMm) {
    if (!tofCloseLatch) {
      tofCloseLatch = true;
      tofCloseSinceMs = now;
    }
    if (now - tofCloseSinceMs >= cfg::kDistanceConfirmMs) {
      tofPresent = true;
      tofLastCloseMs = now;
    }
  } else {
    tofCloseLatch = false;
  }
  if (tofPresent && now - tofLastCloseMs > cfg::kDistanceHoldMs) tofPresent = false;

  return valid;
}

}  // namespace

void begin() {
  Wire.begin(cfg::kPinSda, cfg::kPinScl, 400000);
  // The HC-SR501 has a push-pull output. The pull-down makes a disconnected module read
  // LOW instead of floating HIGH, so a missing PIR cannot fake presence.
  pinMode(cfg::kPinPir, INPUT_PULLDOWN);

  tofReady = initTof();
  inaReady = initIna();
  tofMissingAlerted = !tofReady;
  inaMissingAlerted = !inaReady;

  // A non-zero "last presence" starts ControlTask's 5-minute away timer at boot. Without
  // it, a PIR that never fires would leave the old sentinel (0 = "never seen") in place and
  // the lamp would stay on forever.
  const uint32_t now = millis();
  {
    app::StateLock lock;
    app::state.local.lastPresenceMs = now ? now : 1;
  }
  lastEnergyMs = now;

  Serial.printf("[sensors] VL53L0X %s, INA219 %s (pir GPIO%d)\n", tofReady ? "ok" : "MISSING",
                inaReady ? "ok" : "MISSING", cfg::kPinPir);
  if (cfg::kSensorDebug) {
    Serial.printf("[pir] GPIO%d INPUT_PULLDOWN, level now = %d\n", cfg::kPinPir,
                  digitalRead(cfg::kPinPir) == HIGH ? 1 : 0);
    Serial.printf(
        "[pir] ignoring the module for %lu ms of warm-up (HC-SR501 wants 5 V and 30-60 s)\n",
        static_cast<unsigned long>(cfg::kPirWarmupMs));
  }
  if (!tofReady || !inaReady) {
    app::raiseAlert("Gateway sensor missing at boot (VL53L0X %s, INA219 %s)",
                    tofReady ? "ok" : "missing", inaReady ? "ok" : "missing");
  }
}

void task(void *) {
  TickType_t lastWake = xTaskGetTickCount();
  for (;;) {
    const uint32_t now = millis();

    // ---- retry sensors that are absent or gave up
    if (!tofReady && now - lastTofTryMs >= cfg::kSensorRetryMs) {
      lastTofTryMs = now;
      tofReady = initTof();
      if (tofReady && tofMissingAlerted) {
        tofMissingAlerted = false;
        app::raiseAlert("VL53L0X back online");
      }
      Serial.printf("[sensors] VL53L0X re-init %s\n", tofReady ? "ok" : "failed");
    }
    if (!inaReady && now - lastInaTryMs >= cfg::kSensorRetryMs) {
      lastInaTryMs = now;
      inaReady = initIna();
      if (inaReady && inaMissingAlerted) {
        inaMissingAlerted = false;
        app::raiseAlert("INA219 back online");
      }
      Serial.printf("[sensors] INA219 re-init %s\n", inaReady ? "ok" : "failed");
    }

    // ---- PIR + distance -> presence
    readPir(now);
    uint16_t mm = 0;
    const bool distOk = readTof(now, mm);
    const bool presence = pirPresent || tofPresent;
    const uint8_t presenceSrc =
        (pirPresent ? app::kPresencePir : 0) | (tofPresent ? app::kPresenceToF : 0);

    // ---- INA219 -> volts / amps / watts, then integrate into Wh
    float v = 0, ma = 0, mw = 0;
    bool inaOk = false;
    if (inaReady) {
      inaOk = ina.read(v, ma, mw);
      if (!inaOk) {
        if (++inaFails >= cfg::kSensorFailLimit) {
          inaFails = 0;
          inaReady = false;
          inaMissingAlerted = true;
          app::raiseAlert("INA219 stopped answering: re-initialising");
        }
      } else {
        inaFails = 0;
      }
    }

    // ---- one line per second that says what every input is doing, so a silent sensor is
    // distinguishable from a working one whose value is simply filtered out.
    if (cfg::kSensorDebug && now - lastPirDebugMs >= cfg::kSensorDebugPeriodMs) {
      lastPirDebugMs = now;
      const char *phase = now < cfg::kPirWarmupMs ? "warmup" : "live";
      Serial.printf("[sens] t=%lus %s raw=%d edges=%lu high_s=%lu.%01lu pir=%d confirm=%lums "
                    "tof=%d %umm pres=%d src=%s\n",
                    static_cast<unsigned long>(now / 1000), phase, pirRaw ? 1 : 0,
                    static_cast<unsigned long>(pirRisingEdges),
                    static_cast<unsigned long>(pirHighMsTotal / 1000),
                    static_cast<unsigned long>((pirHighMsTotal % 1000) / 100),
                    pirPresent ? 1 : 0,
                    static_cast<unsigned long>(pirHighLatch ? now - pirHighSinceMs : 0),
                    distOk ? 1 : 0, static_cast<unsigned>(mm), presence ? 1 : 0,
                    presenceSourceName(presenceSrc));
    }

    uint32_t dt = now - lastEnergyMs;
    lastEnergyMs = now;
    if (dt > cfg::kEnergyDtMaxMs) dt = cfg::kEnergyDtMaxMs;  // a blocking init is not a load

    {
      app::StateLock lock;
      auto &s = app::state.local;
      s.distMm = distOk ? mm : 0;  // 0/8190 both mean "no target"; never hand those to the AI
      s.distOk = distOk;
      s.tofOk = tofReady;
      s.presence = presence;
      s.presenceSrc = presenceSrc;
      if (presence) s.lastPresenceMs = now;
      s.inaOk = inaReady && inaOk;
      if (inaOk) {
        s.busV = v;
        s.currentMa = ma;
        s.powerMw = mw;
        const float wh = (mw / 1000.0f) * (static_cast<float>(dt) / 3600000.0f);
        int mode = static_cast<int>(app::state.mode);
        if (mode < 0 || mode > 2) mode = 0;
        s.energyWh += wh;
        s.modeEnergyWh[mode] += wh;
        s.modeMs[mode] += dt;
      } else {
        s.busV = 0;
        s.currentMa = 0;
        s.powerMw = 0;
      }
    }

    vTaskDelayUntil(&lastWake, pdMS_TO_TICKS(cfg::kSensorPeriodMs));
  }
}

}  // namespace sensors
