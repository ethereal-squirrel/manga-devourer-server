-- CreateTable
CREATE TABLE "RecentlyRead" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "isLocal" BOOLEAN NOT NULL,
    "seriesId" INTEGER NOT NULL,
    "fileId" INTEGER NOT NULL,
    "currentPage" INTEGER NOT NULL,
    "totalPages" INTEGER NOT NULL,
    "volume" INTEGER NOT NULL,
    "chapter" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "series" TEXT NOT NULL
);
