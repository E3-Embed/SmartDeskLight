#include "status_led.h"

#include <Adafruit_NeoPixel.h>
#include <Arduino.h>

#include "node_config.h"

namespace status_led {
namespace {

Adafruit_NeoPixel pixel(1, nodecfg::kPinStatusLed, NEO_GRB + NEO_KHZ800);

struct Rgb {
  uint8_t r, g, b;
};

constexpr Rgb kOff{0, 0, 0};
constexpr Rgb kWhite{255, 255, 255};  // boot
constexpr Rgb kBlue{0, 80, 255};      // scanning
constexpr Rgb kGreen{0, 255, 0};      // linked
constexpr Rgb kAmber{255, 200, 0};    // linked, ACKs failing
constexpr Rgb kRed{255, 0, 0};        // no gateway

// Written by the main task, read by the LED task; a one-byte aligned store is atomic here.
volatile LinkState gState = LinkState::Boot;

void show(Rgb c) {
  pixel.setPixelColor(0, pixel.Color(c.r, c.g, c.b));
  pixel.show();  // ~30 us for one pixel, RMT-driven
}

Rgb scale(Rgb c, uint8_t amount) {
  return Rgb{static_cast<uint8_t>(c.r * amount / 255), static_cast<uint8_t>(c.g * amount / 255),
             static_cast<uint8_t>(c.b * amount / 255)};
}

bool blinking(uint32_t periodMs, uint32_t onMs) { return (millis() % periodMs) < onMs; }

// Triangle over periodMs, so "working on it" breathes instead of blinking.
uint8_t pulse(uint32_t periodMs) {
  const uint32_t t = millis() % periodMs;
  const uint32_t half = periodMs / 2;
  return static_cast<uint8_t>(t < half ? (t * 255 / half) : ((periodMs - t) * 255 / half));
}

Rgb render(LinkState s) {
  switch (s) {
    case LinkState::Scanning: return scale(kBlue, pulse(5000));
    // case LinkState::Linked: return kGreen;
    case LinkState::Linked: return scale(kGreen, pulse(5000));
    case LinkState::Retrying: return blinking(600, 300) ? kAmber : kOff;
    case LinkState::NoGateway: return blinking(400, 120) ? kRed : kOff;
    case LinkState::Boot: break;
  }
  return kOff;
}

const char *stateName(LinkState s) {
  switch (s) {
    case LinkState::Boot: return "boot";
    case LinkState::Scanning: return "scanning for gateway (blue pulse)";
    case LinkState::Linked: return "linked (green)";
    case LinkState::Retrying: return "linked, ACKs failing (amber blink)";
    case LinkState::NoGateway: return "no gateway (red blink)";
  }
  return "?";
}

}  // namespace

void begin() {
  pixel.begin();
  pixel.setBrightness(nodecfg::kStatusLedBrightness);
  // Boot flash: proves the pixel itself works even if the radio never does.
  show(kWhite);
  delay(200);
  show(kOff);
}

void setLinkState(LinkState s) { gState = s; }

void task(void *) {
  Rgb last{255, 255, 255};  // force the first paint
  LinkState lastState = LinkState::Boot;
  for (;;) {
    const LinkState s = gState;
    if (s != lastState) {
      Serial.printf("[led] %s\n", stateName(s));
      lastState = s;
    }
    const Rgb c = render(s);
    if (c.r != last.r || c.g != last.g || c.b != last.b) {
      show(c);
      last = c;
    }
    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

}  // namespace status_led
