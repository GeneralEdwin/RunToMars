-- Already created in your account (database "run-to-mars"); kept here for reference / re-creating.
CREATE TABLE IF NOT EXISTS scores (
  id          TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  name        TEXT NOT NULL,
  best        INTEGER NOT NULL DEFAULT 0,
  coins       INTEGER NOT NULL DEFAULT 0,
  lvl         INTEGER NOT NULL DEFAULT -1,
  at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scores_best ON scores(best DESC);
