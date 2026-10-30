# Communication protocols

## Node → Gateway · ESP-NOW

Packed struct defined in [`firmware/common/message.h`](../firmware/common/message.h):

```c
{ version, type, node_id, seq, ts_ms, lux, r, g, b, c, cct }
```

The gateway answers `ACK { version, type, node_id, seq }`. Without an ACK in 100 ms the node retries up to 3 times; the gateway de-duplicates by `(node_id, seq)`.

## Gateway ↔ NETPIE2020 · MQTTS (port 1884)

| Topic | Direction | Payload |
|---|---|---|
| `@msg/sdl/<node_id>/telemetry` | gateway → cloud | Raw JSON per reading |
| `@shadow/data/update` | gateway → cloud | Per-node state for Feed and Dashboard |
| `@msg/sdl/cmd` | dashboard → gateway | Activity mode or user feedback |

```json
{"node_id":"N1","seq":1024,"ts":1730300000,"lux":412.5,"cct":4300,"dist_mm":550,
 "presence":1,"lamp_mW":3120,"filters":[1,0,0],"pwm":180,"mode":"reading"}
```

## Gateway ↔ AI · HTTPS

```json
// request
{"lux":412,"cct":4300,"dist_mm":550,"presence":1,"activity":"reading",
 "filters":[1,0,0],"pwm":180,"feedback":[{"t":"21:40","v":"too_bright"}]}

// response
{"target_lux":450,"target_cct":4000,"filters":[1,0,1],"reason":"evening reading, user found it too bright"}
```

The gateway clamps `target_lux` to 200–750 lux, rate-limits servo moves and keeps the last good (or rule-based) profile if the request fails.

---

[← Back to README](../README.md)
