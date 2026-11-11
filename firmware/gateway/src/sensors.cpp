#include "sensors.h"

#include <VL53L0X.h>
#include <Wire.h>

#include "app.h"
#include "ina219.h"

namespace sensors {
namespace {

VL53L0X tof;
Ina219 ina(Wire);
bool tofReady = false;
bool inaReady = false;
bool faultAlerted = false;

}  // namespace

void begin() {
  Wire.begin(cfg::kPinSda, cfg::kPinScl, 400000);
  pinMode(cfg::kPinPir, INPUT);

  tof.setBus(&Wire);
  tof.setTimeout(100);
  tofReady = tof.init();
  if (tofReady) tof.startContinuous(100);  // new range every 100 ms

  inaReady = ina.begin(0.1f, 2.0f);

  Serial.printf("[sensors] VL53L0X %s, INA219 %s\n", tofReady ? "ok" : "MISSING",
                inaReady ? "ok" : "MISSING");
  if (!tofReady || !inaReady) {
    app::raiseAlert("Gateway sensor missing at boot (VL53L0X %s, INA219 %s)",
                    tofReady ? "ok" : "missing", inaReady ? "ok" : "missing");
  }
}

void task(void *) {
  TickType_t lastWake = xTaskGetTickCount();
  for (;;) {
    uint16_t mm = 0;
    bool distOk = false;
    bool tofTimeout = false;
    if (tofReady) {
      mm = tof.readRangeContinuousMillimeters();
      tofTimeout = tof.timeoutOccurred();
      distOk = !tofTimeout && mm < 8000;  // ~8190 means "nothing in range"
    }

    bool presence = digitalRead(cfg::kPinPir) == HIGH;

    float v = 0, ma = 0, mw = 0;
    bool inaOk = inaReady && ina.read(v, ma, mw);

    bool fault = tofTimeout || (inaReady && !inaOk);
    if (fault && !faultAlerted) {
      app::raiseAlert("Gateway sensor read error (VL53L0X %s, INA219 %s)", distOk ? "ok" : "fail",
                      inaOk ? "ok" : "fail");
    }
    faultAlerted = fault;

    {
      app::StateLock lock;
      auto &s = app::state.local;
      s.distMm = mm;
      s.distOk = distOk;
      if (presence) s.lastPresenceMs = millis();
      s.presence = presence;
      s.inaOk = inaOk;
      if (inaOk) {
        s.busV = v;
        s.currentMa = ma;
        s.powerMw = mw;
      }
    }
    vTaskDelayUntil(&lastWake, pdMS_TO_TICKS(200));
  }
}

}  // namespace sensors
