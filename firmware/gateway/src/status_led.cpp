#include "status_led.h"

#include <Adafruit_NeoPixel.h>
#include <Arduino.h>

#include "app.h"
#include "config.h"

namespace status_led {
namespace {

Adafruit_NeoPixel pixel(1, cfg::kPinRgbLed, NEO_GRB + NEO_KHZ800);

struct Rgb {
  uint8_t r, g, b;
};

constexpr Rgb kOff{0, 0, 0};
constexpr Rgb kGreen{0, 255, 0};      // cloud + fresh node data
constexpr Rgb kAmber{255, 200, 0};    // Wi-Fi up, MQTT/TLS not connected
constexpr Rgb kRed{255, 0, 0};        // no Wi-Fi at all
constexpr Rgb kBlue{0, 0, 255};       // safe state (stop button)
constexpr Rgb kMagenta{200, 0, 200};  // node silent: no telemetry and no heartbeat
constexpr Rgb kViolet{0, 0, 255};   // node alive, waiting for its first reading
constexpr Rgb kCyan{0, 200, 200};     // waiting for NTP before TLS may start
constexpr Rgb kWhite{255, 255, 255};  // boot / associating

void show(Rgb c) {
  pixel.setPixelColor(0, pixel.Color(c.r, c.g, c.b));
  pixel.show();  // ~30 us for one pixel, RMT-driven
}

Rgb scale(Rgb c, uint8_t amount) {
  return Rgb{static_cast<uint8_t>(c.r * amount / 255), static_cast<uint8_t>(c.g * amount / 255),
             static_cast<uint8_t>(c.b * amount / 255)};
}

// Blink helper: on within the first onMs of every periodMs.
bool blinking(uint32_t periodMs, uint32_t onMs) { return (millis() % periodMs) < onMs; }

// Smooth 0..255 triangle over periodMs, so a "waiting" state breathes instead of blinking.
uint8_t pulse(uint32_t periodMs) {
  const uint32_t t = millis() % periodMs;
  const uint32_t half = periodMs / 2;
  return static_cast<uint8_t>(t < half ? (t * 255 / half) : ((periodMs - t) * 255 / half));
}

enum class State : uint8_t {
  Boot,
  Associating,
  WifiFailed,
  WaitNtp,
  WaitMqtt,
  NoNode,
  NoReading,
  Ok,
  Safe,
};

const char *stateName(State s) {
  switch (s) {
    case State::Boot: return "boot";
    case State::Associating: return "associating (white pulse)";
    case State::WifiFailed: return "no wi-fi (red blink)";
    case State::WaitNtp: return "waiting for NTP (cyan blink)";
    case State::WaitMqtt: return "waiting for MQTT (amber blink)";
    case State::NoNode: return "node silent (magenta blink)";
    case State::NoReading: return "node alive, no sensor reading yet (violet pulse)";
    case State::Ok: return "online (green)";
    case State::Safe: return "SAFE (blue)";
  }
  return "?";
}

Rgb render(State s, uint32_t now) {
  switch (s) {
    case State::Safe: {
      const uint32_t t = now % 1000;
      return (t < 100 || (t >= 250 && t < 350)) ? kBlue : kOff;  // double blink
    }
    case State::Associating: return scale(kWhite, pulse(5000));
    case State::WifiFailed: return blinking(400, 200) ? kRed : kOff;
    case State::WaitNtp: return blinking(1000, 500) ? kCyan : kOff;
    case State::WaitMqtt: return blinking(1000, 500) ? kAmber : kOff;
    case State::NoNode: return blinking(1500, 600) ? kMagenta : kOff;
    case State::NoReading: return scale(kViolet, pulse(5000));
    case State::Ok: return kGreen;
    case State::Boot: break;
  }
  return kOff;
}

// Two separate questions about the primary node:
//   readings: has telemetry arrived recently enough to close the control loop?
//   alive:    are health heartbeats still arriving?
// updateNodeSys() deliberately does not refresh lastSeenMs, so a node that is connected but
// has no sensor driver yet is alive and not fresh — that difference is the violet state.
struct NodeHealth {
  bool readings;
  bool alive;
};

NodeHealth primaryNodeHealth(uint32_t now) {
  for (const auto &n : app::state.nodes) {
    if (n.used && n.id == cfg::kPrimaryNodeId) {
      return {now - n.lastSeenMs < cfg::kNodeStaleMs,
              n.sysSeen && now - n.lastSysMs < cfg::kNodeStaleMs};
    }
  }
  return {false, false};
}

}  // namespace

void begin() {
  pixel.begin();
  pixel.setBrightness(2);  // the devkit LED is bright enough to be annoying at night
  // Boot flash: proves the LED itself works even if the network never comes up.
  show(kWhite);
  delay(200);
  show(kOff);
}

void task(void *) {
  // Last drawn colour, so the RMT transfer only runs when a pattern actually changes.
  Rgb last{255, 255, 255};
  State lastState = State::Boot;
  uint32_t wifiLostAt = 0;  // when the link went down, 0 while it is up
  Serial.println("[led] boot");

  for (;;) {
    bool safe, cloudUp, wifiTried;
    NodeHealth node;
    uint32_t now;
    {
      app::StateLock lock;
      safe = app::state.lamp.safe;
      cloudUp = app::state.cloudUp;
      now = millis();
      node = primaryNodeHealth(now);
    }
    const EventBits_t bits = xEventGroupGetBits(app::events);
    const bool wifiUp = (bits & app::kBitWifiUp) != 0;
    wifiTried = (bits & app::kBitWifiTried) != 0;
    const bool clockSet = app::nowEpoch() != 0;  // TLS cannot start before this

    // Priority order: safety beats link state, link beats data freshness.
    State s;
    if (safe) {
      s = State::Safe;
      wifiLostAt = wifiUp ? 0 : wifiLostAt;
    } else if (!wifiTried) {
      s = State::Associating;
    } else if (!wifiUp) {
      // A single dropped beacon or a DHCP renew must not paint the lamp red. Only call it
      // a failure once the link has actually been down for a moment.
      if (wifiLostAt == 0) wifiLostAt = now;
      s = (now - wifiLostAt >= 3000) ? State::WifiFailed : lastState;
    } else {
      wifiLostAt = 0;
      if (!clockSet) {
        s = State::WaitNtp;
      } else if (!cloudUp) {
        s = State::WaitMqtt;
      } else if (!node.readings) {
        s = node.alive ? State::NoReading : State::NoNode;
      } else {
        s = State::Ok;
      }
    }

    if (s != lastState) {
      Serial.printf("[led] %s\n", stateName(s));
      lastState = s;
    }

    const Rgb c = render(s, now);

    if (c.r != last.r || c.g != last.g || c.b != last.b) {
      show(c);
      last = c;
    }
    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

}  // namespace status_led
