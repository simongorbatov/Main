-- One row per install per UTC day: how many checks it ran.
CREATE TABLE IF NOT EXISTS uses (
  install_id TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (install_id, day)
);
