-- CreateTable
CREATE TABLE "Tea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "origin" TEXT,
    "brand" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TeaSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teaId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "notes" TEXT,
    "brewTempC" INTEGER,
    "steepTimeSec" INTEGER,
    "photoUrl" TEXT,
    "consumedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeaSession_teaId_fkey" FOREIGN KEY ("teaId") REFERENCES "Tea" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Tea_type_idx" ON "Tea"("type");

-- CreateIndex
CREATE INDEX "Tea_name_idx" ON "Tea"("name");

-- CreateIndex
CREATE INDEX "TeaSession_teaId_idx" ON "TeaSession"("teaId");

-- CreateIndex
CREATE INDEX "TeaSession_consumedAt_idx" ON "TeaSession"("consumedAt");

-- CreateIndex
CREATE INDEX "TeaSession_rating_idx" ON "TeaSession"("rating");
