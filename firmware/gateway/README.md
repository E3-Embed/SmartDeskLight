# Gateway firmware (ESP32 B)

Owner: นรินธร ยางงาม — Embedded Developer (Gateway & Cloud)

The gateway receives readings from the sensor nodes over ESP-NOW, reads its own sensors, runs the closed-loop lamp control, and talks to NETPIE2020, the LLM API and Discord.

## Tasks

| Task | Priority | Core | File | Job |
|---|:-:|:-:|---|---|
| `ControlTask` | 4 | 1 | `src/control.cpp` | Stop button events, safe state, closed loop on measured lux (filters + PWM) |
| `EspNowRxTask` | 3 | 1 | `src/espnow_link.cpp` | Drain ESP-NOW packets, de-duplicate by `(node_id, seq)`, node table |
| `SensorTask` | 2 | 1 | `src/sensors.cpp` | VL53L0X distance, PIR presence, INA219 power every 200 ms |
| `CloudTask` | 1 | 0 | `src/cloud.cpp` | Wi-Fi, NETPIE MQTTS, store-and-forward, shadow, commands, AI, alerts |
| `loop()` | 1 | 1 | `src/main.cpp` | Status LED (solid = cloud up, blinking = offline) |

**Why these priorities:** safety and control must never wait for the network, so `ControlTask` is highest. `EspNowRxTask` is next so the 32-slot radio queue never overflows. Sensors are periodic and slow. Cloud work (TLS, HTTP) can block for seconds, so it is lowest and runs alone on core 0.

**How tasks communicate (E1):**

| Mechanism | From → to | Carries |
|---|---|---|
| `qTelemetry` queue | ESP-NOW callback → EspNowRxTask | `SdlTelemetry` packets |
| `qCloud` queue | EspNowRxTask → CloudTask | new readings + receive time |
| `qControl` queue | stop ISR, CloudTask → ControlTask | stop, mode, feedback, new AI profile |
| `qAlerts` queue | any task → CloudTask | alert text for Discord / NETPIE |
| `events` event group | CloudTask ↔ others | Wi-Fi up, MQTT up, "AI profile requested" |
| `stateMutex` mutex | all tasks | shared `app::state` (via `StateLock`) |

## Files

| File | Purpose |
|---|---|
| `src/config.h` | Pins, timings, control gains, NETPIE topics — the only place to change them |
| `src/app.h/.cpp` | Shared types, queues, mutex, event group, `raiseAlert()` |
| `src/ina219.h/.cpp` | **Own INA219 driver** at register level (E8) |
| `src/lamp.h/.cpp` | Servo filters (limits, rate limit, detach timeout) and LED PWM |
| `src/espnow_link.h/.cpp` | ESP-NOW receive + ACK, node table, simulated nodes |
| `src/sensors.h/.cpp` | SensorTask |
| `src/control.h/.cpp` | ControlTask, rule-based profiles, AI output clamping |
| `src/ai_client.h/.cpp` | Gemini API request / JSON parsing |
| `src/cloud.h/.cpp` | CloudTask: MQTTS, backlog, shadow, commands, Discord |
| `src/ring_buffer.h` | Fixed-size FIFO for store-and-forward |

## Control loop

Every 200 ms `ControlTask`:

1. Handles queued events (stop button toggles the safe state; mode / feedback / AI profile update the target).
2. **Safe state** (stop pressed) → filters folded out, LED at medium, nothing else moves.
3. **Sensor fault** (no packet from node 1 for 10 s) → safe brightness + Discord alert; resumes automatically.
4. **Desk empty** (no PIR motion for 5 min) → LED off; AI is asked again when someone returns.
5. Otherwise: moves filters to the profile (max one change per 10 s), then a proportional step on PWM: `pwm += clamp(Kp × (target − lux), ±12)`, holding when the error is within ±7 % of the target.
6. If PWM saturates and the target is still not reached, the ND filter is flipped — the physical actuator extends the range PWM alone cannot cover.

The AI only proposes `target_lux`, `target_cct` and a filter set; `control::sanitize()` clamps it to 200–750 lux. If the AI is unreachable the rule-based profile (`control::ruleProfile()`) stays active.

## Embedded Engineering Depth in this firmware

| Item | Where | What to show in the demo |
|---|---|---|
| E1 RTOS | `main.cpp`, `app.h` | Four tasks, priorities, queues, mutex, event group |
| E2 Interrupt | `main.cpp` `onStopButton()` | ISR only debounces and posts an event; `ControlTask` does the work |
| E4 Reliable comms | `espnow_link.cpp`, `cloud.cpp`, `ring_buffer.h` | ACK + duplicate counter; unplug Wi-Fi, readings buffer (`buffered` in shadow), then flush in order |
| E5 Security | `cloud.cpp` `task()` | MQTTS on port 1884 with `setCACert(NETPIE_CA_PEM)`; secrets only in git-ignored `secrets.h` |
| E8 Own driver | `ina219.cpp` | Calibration math, register reads; compare with a multimeter / logic analyzer |

## Setup

1. **NETPIE2020:** create a device, copy Client ID / Token / Secret into `include/secrets.h` (copy from `secrets.example.h`).
2. **Root CA (E5):** `openssl s_client -connect mqtt.netpie.io:1884 -showcerts </dev/null`, paste the root certificate into `NETPIE_CA_PEM`. With an empty string the firmware still connects but prints a warning and does **not** verify the certificate.
3. **AI:** put a Gemini API key in `LLM_API_KEY` (empty = rule-based only). The model name is `cfg::kAiModel`.
4. **Discord:** create a channel webhook and put the URL in `DISCORD_WEBHOOK`.
5. **Sensor node channel:** ESP-NOW only works when the node uses the same Wi-Fi channel as the gateway. The gateway prints `[espnow] ready, MAC …, channel N` at boot — the node must call `esp_wifi_set_channel(N, WIFI_SECOND_CHAN_NONE)` and use this MAC as `GATEWAY_MAC`.
6. Build and flash: `pio run -d firmware/gateway -t upload && pio device monitor -d firmware/gateway`.

### NETPIE topics

| Topic | Direction | Payload |
|---|---|---|
| `@msg/sdl/N<id>/telemetry` | gateway → cloud | one reading: `node_id, seq, ts, node_ms, lux, r, g, b, c, cct` |
| `@shadow/data/update` | gateway → cloud, every 5 s | `n1_lux, n1_cct, n1_rx, n1_seq, dist_mm, presence, lamp_mW, diffuser, nd, warm, pwm, safe, mode, target_lux, ai, buffered, dropped, heap, uptime_s` |
| `@msg/sdl/cmd` | dashboard → gateway | `{"mode":"coding"}` or `{"feedback":"too_bright"}` / `"too_dim"` |
| `@msg/sdl/alert` | gateway → cloud | alert text (also sent to Discord) |

### Metrics you can read from the shadow

- **Packet delivery rate:** `n1_rx / n1_seq` (unique packets received ÷ packets the node sent).
- **Uptime:** `uptime_s`; **power per mode:** `lamp_mW` with `mode`, `pwm` and filter fields.
- **Store-and-forward:** `buffered` rises while offline and falls back to 0 after reconnecting; `dropped` must stay 0 for outages under ~5 min.

### Scalability test

Set `cfg::kSimulatedNodes = 2` in `config.h` to add simulated nodes 101 and 102 next to the physical node 1; each appears as its own `N<id>` topic and `n<id>_*` shadow fields.
