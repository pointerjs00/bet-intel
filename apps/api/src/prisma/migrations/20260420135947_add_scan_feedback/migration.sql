-- CreateTable
CREATE TABLE "ScanFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imageBase64" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "aiOutput" JSONB NOT NULL,
    "correctedOutput" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanFeedback_userId_idx" ON "ScanFeedback"("userId");

-- CreateIndex
CREATE INDEX "ScanFeedback_createdAt_idx" ON "ScanFeedback"("createdAt");
