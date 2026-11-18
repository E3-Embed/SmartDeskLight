-- Read-only reference: the EMQX PostgreSQL connector owns these tables and
-- inserts one row per MQTT message. The dashboard never writes here — it only
-- runs the SELECTs in lib/db.ts.
--
-- Tables written by EMQX (18 Nov 2026):
--   public.sdl_sensor_telemetry  lux / cct / RGB per node   (chart lines)
--   public.sdl_gw_state          target_lux / target_cct / pwm (chart targets, time = arrived)
--   public.sdl_gw_telemetry      gateway health (Wi-Fi, heap, reset)
--   public.sdl_sensor_health     node heartbeat (tx_acked / tx_attempts)
--   public.sdl_sensor_status     retained presence map as jsonb
--
-- Use this file to mirror the two tables the charts need on a local Postgres.

CREATE TABLE IF NOT EXISTS public.sdl_sensor_telemetry (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  msgid   text UNIQUE,
  qos     smallint,
  arrived timestamptz NOT NULL DEFAULT now(),
  node_id text NOT NULL,
  seq     bigint,
  ts      bigint,              -- epoch seconds; 0/absent falls back to `arrived`
  node_ms bigint,
  lux     double precision,
  r       integer,
  g       integer,
  b       integer,
  c       integer,
  cct     integer              -- 0 = reading not trustworthy
);

CREATE TABLE IF NOT EXISTS public.sdl_gw_state (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  msgid      text UNIQUE,
  qos        smallint,
  arrived    timestamptz NOT NULL DEFAULT now(),
  device     text,
  n1_lux     double precision,
  n1_cct     integer,
  n1_age_s   integer,
  n1_rx      bigint,
  n1_seq     bigint,
  n1_up_s    bigint,
  n1_heap    integer,
  n1_temp_c  real,
  n1_sys_age_s integer,
  dist_mm    integer,
  presence   smallint,
  lamp_mw    integer,
  bus_v      real,
  current_ma real,
  diffuser   smallint,
  nd         smallint,
  warm       smallint,
  pwm        smallint,
  safe       smallint,
  mode       text,
  target_lux integer,
  target_cct integer,
  ai         smallint,
  buffered   integer,
  dropped    integer,
  heap       integer,
  uptime_s   bigint
);

CREATE INDEX IF NOT EXISTS idx_sdl_sensor_telemetry_node_arrived
  ON public.sdl_sensor_telemetry (node_id, arrived DESC);
CREATE INDEX IF NOT EXISTS idx_sdl_sensor_telemetry_ts
  ON public.sdl_sensor_telemetry (ts DESC);
CREATE INDEX IF NOT EXISTS idx_sdl_gw_state_device_arrived
  ON public.sdl_gw_state (device, arrived DESC);
