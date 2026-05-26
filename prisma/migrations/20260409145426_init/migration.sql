-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteNumber" TEXT NOT NULL,
    "hubspotDealId" TEXT NOT NULL,
    "hubspotDealName" TEXT NOT NULL,
    "hubspotQuoteId" TEXT,
    "company" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "machineModel" TEXT NOT NULL,
    "machinePower" TEXT NOT NULL,
    "laserSource" TEXT NOT NULL,
    "bevelHead" TEXT NOT NULL,
    "deliveryWeeks" INTEGER NOT NULL,
    "tier" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "lineItemsJson" TEXT NOT NULL,
    "subtotal" REAL NOT NULL,
    "discountAmount" REAL NOT NULL,
    "freight" REAL NOT NULL,
    "totalAmount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'sales',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Quote_quoteNumber_key" ON "Quote"("quoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
