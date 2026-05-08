-- Add match-event notification types to the enum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'GOAL_SCORED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'HALF_TIME';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SECOND_HALF_START';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MATCH_FINISHED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RED_CARD';

-- Add fixture notification preferences to User (defaults to all enabled)
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "fixtureNotifPrefs" TEXT[] NOT NULL DEFAULT ARRAY['GOALS','HALF_TIME','MATCH_END','RED_CARD']::TEXT[];
