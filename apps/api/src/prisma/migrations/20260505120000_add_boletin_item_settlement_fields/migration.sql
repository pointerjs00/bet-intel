-- Add auto-settlement fields to BoletinItem
ALTER TABLE "BoletinItem" ADD COLUMN IF NOT EXISTS "eventExternalId" TEXT;
ALTER TABLE "BoletinItem" ADD COLUMN IF NOT EXISTS "needsReview" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "BoletinItem_eventExternalId_idx" ON "BoletinItem"("eventExternalId");
