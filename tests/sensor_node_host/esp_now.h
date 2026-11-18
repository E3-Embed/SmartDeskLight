#pragma once
#include <stdint.h>
#include <stddef.h>
using esp_err_t = int;
constexpr int ESP_OK = 0;
struct esp_now_recv_info_t { const uint8_t *src_addr; };
struct esp_now_peer_info_t {
  uint8_t peer_addr[6]; uint8_t channel; int ifidx; bool encrypt;
};
#if ESP_ARDUINO_VERSION_MAJOR >= 3
using ReceiveCallback = void(*)(const esp_now_recv_info_t*, const uint8_t*, int);
#else
using ReceiveCallback = void(*)(const uint8_t*, const uint8_t*, int);
#endif
extern ReceiveCallback receiveCallback;
inline int esp_now_init() { return ESP_OK; }
inline int esp_now_register_recv_cb(ReceiveCallback cb) { receiveCallback = cb; return ESP_OK; }
inline int esp_now_add_peer(const esp_now_peer_info_t*) { return ESP_OK; }
int esp_now_send(const uint8_t*, const uint8_t*, size_t);

inline int esp_now_del_peer(const uint8_t *) { return ESP_OK; }
inline const char *esp_err_to_name(int) { return "mock-error"; }
