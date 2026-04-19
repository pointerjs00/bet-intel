-- Comprehensive idempotent recovery migration.
-- Uses IF NOT EXISTS on every ADD COLUMN so this is safe to run
-- regardless of which columns already exist in the live database.

-- User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "expoPushToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "defaultBoletinsPublic" BOOLEAN NOT NULL DEFAULT false;

-- Boletin table
ALTER TABLE "Boletin" ADD COLUMN IF NOT EXISTS "siteSlug" TEXT;
ALTER TABLE "Boletin" ADD COLUMN IF NOT EXISTS "betDate" TIMESTAMP(3);
ALTER TABLE "Boletin" ADD COLUMN IF NOT EXISTS "cashoutAmount" DECIMAL(10,2);
ALTER TABLE "Boletin" ADD COLUMN IF NOT EXISTS "isFreebet" BOOLEAN NOT NULL DEFAULT false;

-- SharedBoletin table
ALTER TABLE "SharedBoletin" ADD COLUMN IF NOT EXISTS "sharedWithId" TEXT;
