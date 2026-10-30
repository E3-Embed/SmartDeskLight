# Testing & evaluation

Every metric is repeated at least 10 times and reported as mean / min / max. Details and results live in [`tests/README.md`](../tests/README.md).

| Metric | Method |
|---|---|
| Sensor accuracy | BH1750 vs. reference lux meter at 5 light levels |
| End-to-end latency | sensor → actuator and sensor → dashboard, from timestamps |
| Packet delivery rate | node `seq` vs. packets received at the gateway |
| Power | INA219 readings per lighting mode |
| AI accuracy | share of recommendations accepted without change |
| Uptime | continuous run ≥ 24 h |

Failure tests cover Wi-Fi loss, an unplugged sensor, power loss with automatic recovery, and a lost node triggering an alert.

---

[← Back to README](../README.md)
