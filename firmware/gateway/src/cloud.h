// CloudTask (lowest priority): Wi-Fi, MQTTS to EMQX (E5), store-and-forward (E4),
// dashboard commands, AI requests and Discord alerts.
#pragma once

namespace cloud {

void task(void *);

}  // namespace cloud
