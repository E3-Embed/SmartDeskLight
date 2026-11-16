-- Optional: the app also runs this migration on startup (lib/db.ts).
CREATE TABLE IF NOT EXISTS samples (
  ts         timestamptz NOT NULL,
  lux        double precision NOT NULL,
  cct        double precision NOT NULL,
  target_lux double precision NOT NULL,
  target_cct double precision NOT NULL,
  pwm        smallint NOT NULL
);

CREATE INDEX IF NOT EXISTS samples_ts_idx ON samples (ts DESC);
