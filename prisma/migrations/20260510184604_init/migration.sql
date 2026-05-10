-- CreateTable
CREATE TABLE "DiagnosisHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inputPreview" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "summary" TEXT NOT NULL
);
