#pragma once
using esp_reset_reason_t = int;
constexpr int ESP_RST_UNKNOWN = 0;
inline int esp_reset_reason() { return 1; }
