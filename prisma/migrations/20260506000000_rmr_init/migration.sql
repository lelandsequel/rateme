-- CreateEnum
CREATE TYPE "Role" AS ENUM ('REP', 'RATER', 'SALES_MANAGER', 'RATER_MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "USState" AS ENUM ('AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC');

-- CreateEnum
CREATE TYPE "ManagerType" AS ENUM ('REP_MANAGER', 'RATER_MANAGER');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "ConnectionInitiator" AS ENUM ('REP', 'RATER');

-- CreateEnum
CREATE TYPE "RatingRequestType" AS ENUM ('ONE_TIME', 'ON_BEHALF');

-- CreateEnum
CREATE TYPE "RatingRequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "state" "USState" NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepProfile" (
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "industryId" TEXT NOT NULL,
    "metroArea" TEXT,
    "bio" TEXT,

    CONSTRAINT "RepProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "RaterProfile" (
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "industryId" TEXT NOT NULL,

    CONSTRAINT "RaterProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ManagerProfile" (
    "userId" TEXT NOT NULL,
    "managesType" "ManagerType" NOT NULL,
    "company" TEXT NOT NULL,

    CONSTRAINT "ManagerProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Industry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "Industry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "repUserId" TEXT NOT NULL,
    "raterUserId" TEXT NOT NULL,
    "initiatedBy" "ConnectionInitiator" NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "repUserId" TEXT NOT NULL,
    "raterUserId" TEXT NOT NULL,
    "responsiveness" INTEGER NOT NULL,
    "productKnowledge" INTEGER NOT NULL,
    "followThrough" INTEGER NOT NULL,
    "listeningNeedsFit" INTEGER NOT NULL,
    "trustIntegrity" INTEGER NOT NULL,
    "takeCallAgain" BOOLEAN NOT NULL,
    "ratingRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingRequest" (
    "id" TEXT NOT NULL,
    "type" "RatingRequestType" NOT NULL,
    "status" "RatingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "forRepUserId" TEXT NOT NULL,
    "initiatedByUserId" TEXT NOT NULL,
    "toEmail" TEXT,
    "toRaterUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RatingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMembership" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'expo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_state_idx" ON "User"("state");

-- CreateIndex
CREATE INDEX "RepProfile_industryId_idx" ON "RepProfile"("industryId");

-- CreateIndex
CREATE INDEX "RepProfile_company_idx" ON "RepProfile"("company");

-- CreateIndex
CREATE INDEX "RaterProfile_industryId_idx" ON "RaterProfile"("industryId");

-- CreateIndex
CREATE INDEX "RaterProfile_company_idx" ON "RaterProfile"("company");

-- CreateIndex
CREATE INDEX "ManagerProfile_company_idx" ON "ManagerProfile"("company");

-- CreateIndex
CREATE UNIQUE INDEX "Industry_name_key" ON "Industry"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Industry_slug_key" ON "Industry"("slug");

-- CreateIndex
CREATE INDEX "Industry_slug_idx" ON "Industry"("slug");

-- CreateIndex
CREATE INDEX "Connection_repUserId_status_idx" ON "Connection"("repUserId", "status");

-- CreateIndex
CREATE INDEX "Connection_raterUserId_status_idx" ON "Connection"("raterUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_repUserId_raterUserId_key" ON "Connection"("repUserId", "raterUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_ratingRequestId_key" ON "Rating"("ratingRequestId");

-- CreateIndex
CREATE INDEX "Rating_repUserId_createdAt_idx" ON "Rating"("repUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Rating_raterUserId_createdAt_idx" ON "Rating"("raterUserId", "createdAt");

-- CreateIndex
CREATE INDEX "RatingRequest_forRepUserId_status_idx" ON "RatingRequest"("forRepUserId", "status");

-- CreateIndex
CREATE INDEX "RatingRequest_toEmail_idx" ON "RatingRequest"("toEmail");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMembership_memberId_key" ON "TeamMembership"("memberId");

-- CreateIndex
CREATE INDEX "TeamMembership_managerId_idx" ON "TeamMembership"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");

-- AddForeignKey
ALTER TABLE "RepProfile" ADD CONSTRAINT "RepProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepProfile" ADD CONSTRAINT "RepProfile_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaterProfile" ADD CONSTRAINT "RaterProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaterProfile" ADD CONSTRAINT "RaterProfile_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "Industry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerProfile" ADD CONSTRAINT "ManagerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_repUserId_fkey" FOREIGN KEY ("repUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_raterUserId_fkey" FOREIGN KEY ("raterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_repUserId_fkey" FOREIGN KEY ("repUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_raterUserId_fkey" FOREIGN KEY ("raterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_ratingRequestId_fkey" FOREIGN KEY ("ratingRequestId") REFERENCES "RatingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingRequest" ADD CONSTRAINT "RatingRequest_forRepUserId_fkey" FOREIGN KEY ("forRepUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingRequest" ADD CONSTRAINT "RatingRequest_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

