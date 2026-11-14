// Status light for the sensor node: one WS2812 pixel on nodecfg::kPinStatusLed.
//
//   white, flash at boot   firmware started, LED works
//   blue, slow pulse       scanning channels for the gateway
//   green, solid           linked and heartbeats are being ACKed
//   amber, slow blink      linked, but the last heartbeat went unanswered (retrying)
//   red, fast blink        no gateway: the scan found nothing, or the link went silent
//
// Same shape as the gateway's status_led: one pixel, a 50 ms task, and a colour drawn only
// when it changes, so the RMT transfer (~30 us) stays off the hot path. The node needs the
// task because linkUp() blocks for up to a second while it sweeps channels.
#pragma once

namespace status_led {

enum class LinkState : unsigned char {
  Boot,
  Scanning,
  Linked,
  Retrying,
  NoGateway,
};

void begin();  // init the pixel and flash white once
void task(void *);
void setLinkState(LinkState s);  // called from setup()/loop()

}  // namespace status_led
