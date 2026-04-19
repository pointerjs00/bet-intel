-- Idempotent: add CASHOUT to BoletinStatus enum only if it is missing.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block, so Prisma
-- handles it outside one — but we guard with a DO block for safety.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'BoletinStatus'
      AND e.enumlabel = 'CASHOUT'
  ) THEN
    ALTER TYPE "BoletinStatus" ADD VALUE 'CASHOUT';
  END IF;
END
$$;
