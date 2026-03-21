-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'GOOGLE', 'HYBRID');

-- CreateEnum
CREATE TYPE "Theme" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- CreateEnum
CREATE TYPE "Sport" AS ENUM ('FOOTBALL', 'BASKETBALL', 'TENNIS', 'HANDBALL', 'VOLLEYBALL', 'HOCKEY', 'RUGBY', 'AMERICAN_FOOTBALL', 'BASEBALL', 'OTHER');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('UPCOMING', 'LIVE', 'FINISHED', 'CANCELLED', 'POSTPONED');

-- CreateEnum
CREATE TYPE "BoletinStatus" AS ENUM ('PENDING', 'WON', 'LOST', 'VOID', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ItemResult" AS ENUM ('PENDING', 'WON', 'LOST', 'VOID');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'BOLETIN_SHARED', 'EVENT_RESULT', 'ODDS_CHANGE', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "authProvider" "AuthProvider" NOT NULL DEFAULT 'EMAIL',
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifyToken" TEXT,
    "emailVerifyExpiry" TIMESTAMP(3),
    "passwordResetToken" TEXT,
    "passwordResetExpiry" TIMESTAMP(3),
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "preferredSites" TEXT[],
    "theme" "Theme" NOT NULL DEFAULT 'SYSTEM',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "lastLoginAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BettingSite" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "baseUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastScraped" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BettingSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportEvent" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "sport" "Sport" NOT NULL,
    "league" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'UPCOMING',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SportEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Odd" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "selection" TEXT NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Odd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Boletin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "stake" DECIMAL(10,2) NOT NULL,
    "totalOdds" DECIMAL(10,4) NOT NULL,
    "potentialReturn" DECIMAL(10,2) NOT NULL,
    "status" "BoletinStatus" NOT NULL DEFAULT 'PENDING',
    "actualReturn" DECIMAL(10,2),
    "notes" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Boletin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoletinItem" (
    "id" TEXT NOT NULL,
    "boletinId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "selection" TEXT NOT NULL,
    "oddValue" DECIMAL(10,2) NOT NULL,
    "result" "ItemResult" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "BoletinItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "friendId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FriendRequest" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FriendRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedBoletin" (
    "id" TEXT NOT NULL,
    "boletinId" TEXT NOT NULL,
    "sharedById" TEXT NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedBoletin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_emailVerifyToken_key" ON "User"("emailVerifyToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_passwordResetToken_key" ON "User"("passwordResetToken");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "BettingSite_slug_key" ON "BettingSite"("slug");

-- CreateIndex
CREATE INDEX "BoletinItem_boletinId_idx" ON "BoletinItem"("boletinId");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_userId_friendId_key" ON "Friendship"("userId", "friendId");

-- CreateIndex
CREATE UNIQUE INDEX "FriendRequest_senderId_receiverId_key" ON "FriendRequest"("senderId", "receiverId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Odd" ADD CONSTRAINT "Odd_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "BettingSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Odd" ADD CONSTRAINT "Odd_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SportEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boletin" ADD CONSTRAINT "Boletin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoletinItem" ADD CONSTRAINT "BoletinItem_boletinId_fkey" FOREIGN KEY ("boletinId") REFERENCES "Boletin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoletinItem" ADD CONSTRAINT "BoletinItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SportEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Friendship" ADD CONSTRAINT "Friendship_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendRequest" ADD CONSTRAINT "FriendRequest_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedBoletin" ADD CONSTRAINT "SharedBoletin_boletinId_fkey" FOREIGN KEY ("boletinId") REFERENCES "Boletin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedBoletin" ADD CONSTRAINT "SharedBoletin_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
