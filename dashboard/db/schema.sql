-- Read-only reference: the EMQX PostgreSQL connector owns this table and
-- inserts one row per `@msg/sdl/sensor/telemetry` message. The dashboard never
-- writes here — it only runs the SELECT in lib/db.ts.
--
-- Use this file to mirror the schema on a local Postgres when testing the
-- /api/history path.

CREATE TABLE IF NOT EXISTS public.sdl_sensor_telemetry (
  msgid   text PRIMARY KEY,
  qos     smallint,
  arrived timestamptz NOT NULL DEFAULT now(),
  node_id text NOT NULL,
  seq     bigint,
  ts      bigint,              -- epoch seconds
  node_ms bigint,
  lux     double precision,
  r       integer,
  g       integer,
  b       integer,
  c       integer,
  cct     integer
);

CREATE INDEX IF NOT EXISTS sdl_sensor_telemetry_node_ts_idx
  ON public.sdl_sensor_telemetry (node_id, ts DESC);

CREATE INDEX IF NOT EXISTS sdl_sensor_telemetry_ts_idx
  ON public.sdl_sensor_telemetry (ts DESC);
