// ESP-NOW link to the sensor nodes (E4: ACK + duplicate detection, scalability via node_id).
// Accepts sensor telemetry (SdlTelemetry) and node health heartbeats (SdlSysStatus); both are
// ACKed and de-duplicated the same way. Nodes find the gateway's channel by broadcasting a
// heartbeat probe, so nothing here needs to know a node's address in advance.
#pragma once

namespace espnow_link {

// Initialise ESP-NOW. WiFi must already be in STA mode. Nodes have to use the same
// Wi-Fi channel as the gateway's access point (printed at boot).
bool begin();

// FreeRTOS task: drains received packets, de-duplicates by (node_id, seq), updates the
// per-node table and forwards each new reading to CloudTask.
void rxTask(void *);

// Optional FreeRTOS task that injects packets from simulated nodes (cfg::kSimulatedNodes).
void simulatorTask(void *);

}  // namespace espnow_link
