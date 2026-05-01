-- Convert kickoffAt from TIMESTAMP (naive) to TIMESTAMPTZ (timezone-aware).
--
-- Existing rows were written by node-postgres which always sends Date values
-- as UTC ISO strings ("2026-04-30T02:00:00.000Z"). PostgreSQL TIMESTAMP strips
-- the offset and stores the literal wall-clock time, so the stored value is
-- already in UTC. We therefore interpret existing naive timestamps as UTC via
-- `AT TIME ZONE 'UTC'` when casting.
--
-- After this migration TIMESTAMPTZ stores instants in UTC internally, which
-- eliminates the +1 h display offset caused by the server's local timezone
-- being applied on top of the already-UTC value.

ALTER TABLE "BoletinItem"
  ALTER COLUMN "kickoffAt" TYPE TIMESTAMPTZ(3)
  USING "kickoffAt" AT TIME ZONE 'UTC';
