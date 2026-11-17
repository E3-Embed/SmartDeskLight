#pragma once
#include <stdint.h>
constexpr int WIFI_SECOND_CHAN_NONE = 0;
extern uint8_t fakeChannel;
inline int esp_wifi_set_channel(uint8_t channel, int) { fakeChannel = channel; return 0; }
