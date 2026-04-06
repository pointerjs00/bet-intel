-- AlterEnum
ALTER TYPE "BoletinStatus" ADD VALUE 'CASHOUT';

-- AlterTable
ALTER TABLE "Boletin" ADD COLUMN     "cashoutAmount" DECIMAL(10,2);
