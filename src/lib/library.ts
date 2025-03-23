import fs from "fs";
import path from "path";
import os from "os";
import { createCanvas, loadImage } from "canvas";
import { Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js";
import { Readable } from "stream";

import { isImage } from "./file";
import { prisma } from "./prisma";
import { Library } from "../types/types";
import { getAllSeries } from "./series";
import { extractChapterAndVolume } from "./file";
import { getAllFiles } from "./filesystem";
import { createSeriesPayload } from "./series";

export interface ScanProgress {
  series: string;
  status: "scanning" | "complete" | "error";
  progress?: {
    current: number;
    total: number;
  };
  error?: string;
}

export interface ScanStatus {
  inProgress: boolean;
  series: ScanProgress[];
  startTime: Date;
  completedSeries: number;
  totalSeries: number;
}

const scanStatusMap: Record<number, ScanStatus> = {};

export const getScanStatusMap = () => scanStatusMap;
export const setScanStatus = (id: number, status: ScanStatus) => {
  scanStatusMap[id] = status;
};
export const clearScanStatus = (id: number) => {
  delete scanStatusMap[id];
};

export interface ProcessFileResponse {
  pageCount?: number;
  error?: string;
}

export interface ScanLibraryResponse {
  status: boolean;
  message?: string;
  inProgress?: boolean;
  remaining?: string[];
}

export interface GetScanStatusResponse {
  status: boolean;
  message?: string;
  inProgress?: boolean;
  progress?: {
    completed: number;
    total: number;
    series: ScanProgress[];
  };
  startTime?: Date;
  remaining?: string[];
}

export const getLibraries = async () => {
  const libraries = await prisma.library.findMany();
  return { status: true, libraries };
};

export const getLibrary = async (id: string) => {
  const library = await prisma.library.findUnique({
    where: { id: Number(id) },
  });
  const series = await getAllSeries(Number(id));
  return { status: true, library, series };
};

const getOptimalBufferSize = () => {
  const freeMemory = os.freemem();

  if (freeMemory >= 16 * 1024 * 1024 * 1024) {
    return 32 * 1024 * 1024;
  } else if (freeMemory >= 8 * 1024 * 1024 * 1024) {
    return 16 * 1024 * 1024;
  } else if (freeMemory >= 4 * 1024 * 1024 * 1024) {
    return 8 * 1024 * 1024;
  } else if (freeMemory >= 2 * 1024 * 1024 * 1024) {
    return 4 * 1024 * 1024;
  } else {
    return 1 * 1024 * 1024;
  }
};

export const processFileInline = async (
  file: string,
  previewPath: string
): Promise<ProcessFileResponse> => {
  try {
    const fileStream = fs.createReadStream(file, {
      highWaterMark: getOptimalBufferSize(),
      autoClose: true,
    });
    const webStream = Readable.toWeb(fileStream) as ReadableStream<Uint8Array>;
    const zipReader = new ZipReader(webStream, {
      useWebWorkers: false,
      preventClose: false,
    });

    const entries = await zipReader.getEntries({
      filenameEncoding: "utf-8",
    });

    const imageEntries = entries
      .filter((entry) => !entry.directory && isImage(entry.filename))
      .sort((a, b) => a.filename.localeCompare(b.filename));

    if (imageEntries.length === 0) {
      await zipReader.close();
      return { pageCount: 0 };
    }

    const firstImage = imageEntries[0] as any;
    const writer = new Uint8ArrayWriter();
    const imageData = await firstImage.getData(writer);
    const img = await loadImage(Buffer.from(imageData));

    const maxWidth = 512;
    const scale = maxWidth / img.width;
    const targetWidth = Math.round(img.width * scale);
    const targetHeight = Math.round(img.height * scale);

    const canvas = createCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const buffer = canvas.toBuffer("image/jpeg", {
      quality: 0.7,
      progressive: true,
    });

    await fs.promises.writeFile(previewPath, buffer);
    await zipReader.close();

    return { pageCount: imageEntries.length };
  } catch (error) {
    console.error("Error processing file", error);
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

async function downloadImage(url: string, targetPath: string): Promise<void> {
  const response = await fetch(url);
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  fs.writeFileSync(targetPath, Buffer.from(buffer));
}

export const scanLibrary = async (id: number): Promise<ScanLibraryResponse> => {
  const library = await prisma.library.findUnique({
    where: { id },
  });

  if (!library) {
    return {
      status: false,
      message: "Library not found",
    };
  }

  if (getScanStatusMap()[id]?.inProgress) {
    return {
      status: false,
      message: "Scan already in progress",
    };
  }

  const topLevelFolders = fs
    .readdirSync(library.path)
    .filter((folder) => folder !== ".mangadevourer");

  setScanStatus(id, {
    inProgress: true,
    series: topLevelFolders.map((folder) => ({
      series: folder,
      status: "scanning",
    })),
    startTime: new Date(),
    completedSeries: 0,
    totalSeries: topLevelFolders.length,
  });

  // Start scanning in background
  scanInBackground(id, library.path, topLevelFolders).catch((error) => {
    console.error("[Library] Error during background scan:", error);
    const status = getScanStatusMap()[id];
    if (status) {
      status.inProgress = false;
    }
  });

  return {
    status: true,
    inProgress: true,
    remaining: topLevelFolders,
  };
};

export const getScanStatus = async (
  id: number
): Promise<GetScanStatusResponse> => {
  const status = getScanStatusMap()[id];

  if (!status) {
    return {
      status: false,
      message: "No scan in progress",
      remaining: [],
    };
  }

  const remainingSeries = status.series
    .filter((s) => s.status === "scanning")
    .map((s) => s.series);

  return {
    status: true,
    inProgress: status.inProgress,
    progress: {
      completed: status.completedSeries,
      total: status.totalSeries,
      series: status.series,
    },
    startTime: status.startTime,
    remaining: remainingSeries,
  };
};

const scanInBackground = async (
  libraryId: number,
  libraryPath: string,
  folders: string[]
) => {
  let folderIndex = 0;

  console.log(
    `[Library] Starting scan of ${folders.length} series (processing one at a time due to API limits)`
  );

  const processSeries = async (folder: string) => {
    const startTime = Date.now();

    try {
      console.log(
        `[Library] Processing folder ${folderIndex} of ${folders.length}: ${folder}`
      );

      const seriesIndex = getScanStatusMap()[libraryId].series.findIndex(
        (s) => s.series === folder
      );
      if (seriesIndex !== -1) {
        getScanStatusMap()[libraryId].series[seriesIndex].status = "scanning";
      }

      let existingSeries = await prisma.series.findFirst({
        where: {
          libraryId,
          title: folder,
        },
      });

      if (!existingSeries) {
        let series = await createSeriesPayload(
          "jikan",
          libraryId,
          folder,
          path.join(libraryPath, folder),
          null,
          true
        );

        /**/

        let payload = null;

        if (!series.mangaData) {
          payload = { ...series, mangaData: JSON.stringify({}) };
        } else {
          payload = { ...series, mangaData: JSON.stringify(series.mangaData) };
        }

        console.log(`[Library] Creating new series: ${series.title}`);
        updateProgress(libraryId, folder, "creating_series");

        existingSeries = await prisma.series.create({
          data: { ...series, mangaData: JSON.stringify(series.mangaData) },
        });

        const seriesDir = path.join(
          libraryPath,
          ".mangadevourer",
          "series",
          existingSeries.id.toString(),
          "previews"
        );

        fs.mkdirSync(seriesDir, { recursive: true });

        if (series.mangaData) {
          if (series.mangaData.coverImage) {
            await downloadImage(
              series.mangaData.coverImage,
              path.join(
                libraryPath,
                ".mangadevourer",
                "series",
                existingSeries.id.toString(),
                "cover.jpg"
              )
            );
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (existingSeries) {
        updateProgress(libraryId, folder, "scanning_files");

        const seriesPath = path.join(libraryPath, folder);
        let allFiles = getAllFiles(seriesPath);

        if (!allFiles) {
          throw new Error("Failed to read directory");
        }

        const filteredFiles = allFiles.filter((file: string) =>
          /\.(zip|cbz|rar|cbr|7z|cb7)$/i.test(file)
        );

        if (filteredFiles.length === 0) {
          console.log(
            `[Library] Skipping folder-based series: ${existingSeries.title}`
          );
          updateSeriesComplete(libraryId, folder);
          return;
        }

        const existingFiles = await prisma.file.findMany({
          where: { seriesId: existingSeries.id },
          select: { id: true, path: true },
        });

        const filesToDelete = existingFiles.filter(
          (file: any) => !fs.existsSync(file.path)
        );
        const existingFilePaths = new Set(
          existingFiles
            .filter((file: any) => fs.existsSync(file.path))
            .map((f: any) => f.path)
        );

        const previewDir = path.join(
          libraryPath,
          ".mangadevourer",
          "series",
          existingSeries.id.toString(),
          "previews"
        );
        fs.mkdirSync(previewDir, { recursive: true });

        const filesToCreate = [];
        console.log(
          `[Library] Processing ${filteredFiles.length} files for series: ${existingSeries.title}`
        );
        updateProgress(
          libraryId,
          folder,
          "processing_files",
          undefined,
          filteredFiles.length
        );

        for (const [index, file] of filteredFiles.entries()) {
          if (existingFilePaths.has(file)) continue;

          const startFile = Date.now();

          console.log(`[Library] Processing new file: ${path.basename(file)}`);
          const { volume, chapter } = extractChapterAndVolume(file);

          try {
            const response = await processFileInline(
              file,
              path.join(previewDir, `${path.basename(file)}.jpg`)
            );

            filesToCreate.push({
              path: file,
              fileName: path.basename(file),
              fileFormat: path.extname(file).slice(1),
              volume: volume ?? 0,
              chapter: chapter ?? 0,
              totalPages: response?.pageCount ?? 0,
              currentPage: 0,
              isRead: false,
              seriesId: existingSeries.id,
            });
          } catch (error) {
            console.error(
              `[Library] Error processing file ${path.basename(file)}:`,
              error
            );
          }

          updateProgress(
            libraryId,
            folder,
            "file_processed",
            index + 1,
            filteredFiles.length
          );

          const endFile = Date.now();
          const fileDuration = (endFile - startFile) / 1000;
          console.log(
            `[Library] File ${path.basename(
              file
            )} processed in ${fileDuration} seconds`
          );
        }

        if (filesToDelete.length > 0 || filesToCreate.length > 0) {
          await prisma.$transaction([
            ...(filesToDelete.length > 0
              ? [
                  prisma.file.deleteMany({
                    where: {
                      id: {
                        in: filesToDelete.map((f: any) => f.id),
                      },
                    },
                  }),
                ]
              : []),
            ...(filesToCreate.length > 0
              ? filesToCreate.map((data) => prisma.file.create({ data }))
              : []),
          ]);

          if (filesToDelete.length > 0) {
            console.log(
              `[Library] Removed ${filesToDelete.length} deleted files`
            );
            updateProgress(
              libraryId,
              folder,
              "files_removed",
              undefined,
              undefined,
              filesToDelete.length
            );
          }
        }
      }

      updateSeriesComplete(libraryId, folder);
    } catch (error) {
      console.error(`[Library] Error scanning series ${folder}:`, error);
      updateError(
        libraryId,
        folder,
        error instanceof Error ? error.message : "Unknown error"
      );
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    console.log(`[Library] Series ${folder} completed in ${duration} seconds`);
  };

  for (const folder of folders) {
    folderIndex++;
    await processSeries(folder);
  }

  const series = await prisma.series.findMany();

  for (const s of series) {
    if (!fs.existsSync(s.path)) {
      console.log(`[Library] Series ${s.title} has no files, deleting`);

      await prisma.file.deleteMany({
        where: { seriesId: s.id },
      });

      await prisma.series.delete({
        where: { id: s.id },
      });
    }
  }

  console.log("[Library] Scan completed");
  getScanStatusMap()[libraryId].inProgress = false;
};

// Helper functions for progress updates
const updateProgress = (
  libraryId: number,
  series: string,
  status: string,
  current?: number,
  total?: number,
  count?: number
) => {
  const idx = getScanStatusMap()[libraryId].series.findIndex(
    (s) => s.series === series
  );
  if (idx !== -1) {
    if (current !== undefined && total !== undefined) {
      getScanStatusMap()[libraryId].series[idx].progress = { current, total };
    }
  }
};

const updateError = (libraryId: number, series: string, error: string) => {
  const idx = getScanStatusMap()[libraryId].series.findIndex(
    (s) => s.series === series
  );
  if (idx !== -1) {
    getScanStatusMap()[libraryId].series[idx].status = "error";
    getScanStatusMap()[libraryId].series[idx].error = error;
  }
};

const updateSeriesComplete = (libraryId: number, series: string) => {
  const idx = getScanStatusMap()[libraryId].series.findIndex(
    (s) => s.series === series
  );
  if (idx !== -1) {
    getScanStatusMap()[libraryId].series[idx].status = "complete";
  }
  getScanStatusMap()[libraryId].completedSeries++;
};
