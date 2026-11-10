-- Plan #24 (part 2): drop the legacy visibility feature, replaced by Boletin.isPublic.
-- Checked in production on 10/11/2026 before dropping: all 349 boletins were PRIVATE (the default)
-- and no code reads these columns, so nothing in use is lost.

ALTER TABLE "Boletin" DROP COLUMN IF EXISTS "visibility";
ALTER TABLE "User" DROP COLUMN IF EXISTS "defaultBoletinVisibility";
DROP TYPE IF EXISTS "BoletinVisibility";
