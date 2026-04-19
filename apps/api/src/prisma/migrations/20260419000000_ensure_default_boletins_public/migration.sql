-- Idempotent recovery migration.
-- The previous migration (20260412000000) may have been recorded as applied
-- in _prisma_migrations without the DDL actually executing on the live DB.
-- Using IF NOT EXISTS ensures this is safe to run regardless of current state.
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "defaultBoletinsPublic" BOOLEAN NOT NULL DEFAULT false;
