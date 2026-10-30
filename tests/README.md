# Test plan and results

Repeat each measurement ≥ 10 times and report mean / min / max.

| Metric | Method | Result |
|---|---|---|
| BH1750 accuracy | compare with reference lux meter at 5 light levels | |
| End-to-end latency | sensor → actuator, sensor → dashboard (timestamps) | |
| Packet delivery rate | node seq vs gateway received, with retries | |
| Lamp power | INA219 per mode | |
| AI accuracy | % recommendations accepted without change | |
| Uptime | continuous run ≥ 24 h | |

Failure tests: Wi-Fi loss, sensor unplugged, power loss + recovery, node lost → alert.
