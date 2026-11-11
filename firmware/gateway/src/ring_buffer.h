// Fixed-size FIFO used for store-and-forward (E4). No heap allocation.
// When full, the oldest item is overwritten and counted in dropped().
// Single owner (CloudTask), so it needs no locking.
#pragma once
#include <stddef.h>
#include <stdint.h>

template <typename T, size_t N>
class RingBuffer {
 public:
  void push(const T &item) {
    if (count_ == N) {  // full: drop the oldest reading
      tail_ = (tail_ + 1) % N;
      count_--;
      dropped_++;
    }
    items_[head_] = item;
    head_ = (head_ + 1) % N;
    count_++;
  }

  bool peek(T &out) const {
    if (count_ == 0) return false;
    out = items_[tail_];
    return true;
  }

  void pop() {
    if (count_ == 0) return;
    tail_ = (tail_ + 1) % N;
    count_--;
  }

  size_t size() const { return count_; }
  bool empty() const { return count_ == 0; }
  uint32_t dropped() const { return dropped_; }

 private:
  T items_[N];
  size_t head_ = 0, tail_ = 0, count_ = 0;
  uint32_t dropped_ = 0;
};
