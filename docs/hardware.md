# Hardware

## Bill of materials

| Item | Qty | Location | Purpose | Est. cost (THB) |
|---|:-:|---|---|--:|
| ESP32 DevKit | 2 (+1) | Node / Gateway | MCUs (+1 for a second physical node) | 380 (+190) |
| BH1750 | 1 | Node | Desk illuminance (lux) — closed-loop feedback | 74–120 |
| TCS34725 | 1 | Node | RGB + clear → colour temperature | 85–180 |
| VL53L0X | 1 | Gateway | Distance lamp → user / desk | 165–320 |
| PIR (HC-SR501) | 1 | Gateway | Presence at the desk | 40–100 |
| INA219 | 1 | Gateway | Lamp voltage / current / power | 45–120 |
| Servo SG90 / MG90S | 3 | Gateway | Flip each filter in or out of the light path | 300–540 |
| LED module + constant-current driver | 1 | Gateway | Light source with PWM dimming | 230–550 |
| Supply, filter films, frame, hinges, PCB, wiring, fuse, button, spares | — | — | Build | 1,000–2,400 |
| **Total** | | | **5 sensor types · 1 actuator type** | **≈ 2,320–4,710** |

## Pin map (ESP32 DevKit)

| Board | Signal | GPIO | Notes |
|---|---|:-:|---|
| Node | I²C SDA / SCL | 21 / 22 | BH1750 `0x23`, TCS34725 `0x29` |
| Gateway | I²C SDA / SCL | 21 / 22 | VL53L0X `0x29`, INA219 `0x40` |
| Gateway | PIR output | 34 | Input-only pin |
| Gateway | Stop / override button | 4 | `INPUT_PULLUP`, active low, falling-edge ISR |
| Gateway | Servo 1 / 2 / 3 | 25 / 26 / 27 | Diffuser / ND / Warm-CTO, LEDC 50 Hz |
| Gateway | LED driver PWM | 18 | LEDC ≈ 5 kHz |
| Gateway | Status LED | 2 | On-board |

> [!IMPORTANT]
> Servos run from a separate 5 V ≥ 2 A rail, the LED from its own DC supply through the driver, and INA219 sits high-side on the LED rail. **All grounds are common.**

## Safety

- Low-voltage DC only — no mains wiring in the project
- Mechanical end stops, software angle limits and a timeout on every servo move
- Stop button always wins; safe state = filters folded, LED at medium
- Filter films rated for lighting use, mounted away from hot parts

---

[← Back to README](../README.md)
