/*
  Warnings:

  - Added the required column `fileName` to the `File` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_File" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "path" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileFormat" TEXT NOT NULL,
    "volume" INTEGER NOT NULL,
    "chapter" INTEGER NOT NULL,
    "totalPages" INTEGER NOT NULL,
    "currentPage" INTEGER NOT NULL,
    "isRead" BOOLEAN NOT NULL,
    "seriesId" INTEGER NOT NULL,
    CONSTRAINT "File_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_File" ("chapter", "currentPage", "fileFormat", "id", "isRead", "path", "seriesId", "totalPages", "volume") SELECT "chapter", "currentPage", "fileFormat", "id", "isRead", "path", "seriesId", "totalPages", "volume" FROM "File";
DROP TABLE "File";
ALTER TABLE "new_File" RENAME TO "File";
CREATE UNIQUE INDEX "File_path_key" ON "File"("path");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
