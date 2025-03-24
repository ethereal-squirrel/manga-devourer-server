/*
  Warnings:

  - Added the required column `libraryId` to the `Collection` table without a default value. This is not possible if the table is not empty.
  - Added the required column `libraryId` to the `RecentlyRead` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Collection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "libraryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "series" TEXT NOT NULL
);
INSERT INTO "new_Collection" ("id", "name", "series") SELECT "id", "name", "series" FROM "Collection";
DROP TABLE "Collection";
ALTER TABLE "new_Collection" RENAME TO "Collection";
CREATE TABLE "new_RecentlyRead" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "isLocal" BOOLEAN NOT NULL,
    "libraryId" INTEGER NOT NULL,
    "seriesId" INTEGER NOT NULL,
    "fileId" INTEGER NOT NULL,
    "currentPage" INTEGER NOT NULL,
    "totalPages" INTEGER NOT NULL,
    "volume" INTEGER NOT NULL,
    "chapter" INTEGER NOT NULL
);
INSERT INTO "new_RecentlyRead" ("chapter", "currentPage", "fileId", "id", "isLocal", "seriesId", "totalPages", "volume") SELECT "chapter", "currentPage", "fileId", "id", "isLocal", "seriesId", "totalPages", "volume" FROM "RecentlyRead";
DROP TABLE "RecentlyRead";
ALTER TABLE "new_RecentlyRead" RENAME TO "RecentlyRead";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
