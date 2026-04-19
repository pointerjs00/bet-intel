-- ============================================================
-- FULL SCHEMA SYNC — idempotent, safe to run at any time.
-- Uses IF NOT EXISTS / DO blocks so every statement is a no-op
-- when the column / index already exists.
-- ============================================================

-- ─── User ─────────────────────────────────────────────────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "expoPushToken"          TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "defaultBoletinsPublic"  BOOLEAN NOT NULL DEFAULT false;

-- ─── Boletin ──────────────────────────────────────────────────────────────────
ALTER TABLE "Boletin" ADD COLUMN IF NOT EXISTS "isPublic"        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Boletin" ADD COLUMN IF NOT EXISTS "siteSlug"        TEXT;
ALTER TABLE "Boletin" ADD COLUMN IF NOT EXISTS "betDate"         TIMESTAMP(3);
ALTER TABLE "Boletin" ADD COLUMN IF NOT EXISTS "cashoutAmount"   DECIMAL(10,2);
ALTER TABLE "Boletin" ADD COLUMN IF NOT EXISTS "isFreebet"       BOOLEAN NOT NULL DEFAULT false;

-- ─── BoletinItem ──────────────────────────────────────────────────────────────
-- These were added by the pivot migration; guard in case that migration only
-- partially applied on this DB instance.
ALTER TABLE "BoletinItem" ADD COLUMN IF NOT EXISTS "homeTeam"    TEXT NOT NULL DEFAULT '';
ALTER TABLE "BoletinItem" ADD COLUMN IF NOT EXISTS "awayTeam"    TEXT NOT NULL DEFAULT '';
ALTER TABLE "BoletinItem" ADD COLUMN IF NOT EXISTS "competition" TEXT NOT NULL DEFAULT '';
ALTER TABLE "BoletinItem" ADD COLUMN IF NOT EXISTS "sport"       TEXT NOT NULL DEFAULT 'FOOTBALL';

-- ─── SharedBoletin ────────────────────────────────────────────────────────────
ALTER TABLE "SharedBoletin" ADD COLUMN IF NOT EXISTS "sharedWithId" TEXT;

-- ─── BoletinStatus enum — ensure CASHOUT value exists ─────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'BoletinStatus' AND e.enumlabel = 'CASHOUT'
  ) THEN
    ALTER TYPE "BoletinStatus" ADD VALUE 'CASHOUT';
  END IF;
END
$$;
