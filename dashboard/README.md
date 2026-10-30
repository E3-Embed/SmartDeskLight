# NETPIE2020 setup

- Device: one NETPIE device for the gateway (Client ID + Token go in `secrets.h`).
- Shadow fields per node: `n1_lux`, `n1_cct`, `n2_lux`, ... plus `dist_mm`, `presence`, `lamp_mW`, `filters`, `pwm`, `mode`.
- Feed: enable datatags for the shadow fields above (raw time series, CSV export for metrics).
- Dashboard widgets: lux/CCT/power charts, filter state, per-node status, activity selector buttons, feedback buttons (too bright / too dim) → `@msg/sdl/cmd`.
- Trigger: Device Status Changed → Event Hook (gateway offline alert).
