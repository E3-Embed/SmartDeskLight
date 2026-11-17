#pragma once
#include <deque>
#include <vector>
#include <string.h>
struct FakeQueue { size_t itemSize; size_t capacity; std::deque<std::vector<uint8_t>> items; };
using QueueHandle_t = FakeQueue*;
inline QueueHandle_t xQueueCreate(size_t capacity, size_t itemSize) {
  return new FakeQueue{itemSize, capacity, {}};
}
inline int xQueueSend(QueueHandle_t q, const void* data, int) {
  if (q->items.size() == q->capacity) return 0;
  const auto* bytes = static_cast<const uint8_t*>(data);
  q->items.emplace_back(bytes, bytes + q->itemSize); return 1;
}
inline int xQueueReceive(QueueHandle_t q, void* data, int) {
  if (q->items.empty()) return 0;
  memcpy(data, q->items.front().data(), q->itemSize); q->items.pop_front(); return 1;
}
