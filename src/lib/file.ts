import JSZip from "jszip";
import { createExtractorFromFile } from "node-unrar-js";
import fs from "fs";
import path from "path";
import { createCanvas, loadImage } from "canvas";
import webp from "webp-wasm";
import { v4 as uuidv4 } from "uuid";
import { finished } from "stream/promises";

import { prisma } from "./prisma";

declare global {
  namespace NodeJS {
    interface Process {
      pkg?: boolean;
    }
  }
}

const validImageExtensions = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".avif",
  ".tiff",
];

export function isImage(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  return validImageExtensions.includes(ext);
}

export const pageEvent = async (fileId: number, page: number) => {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
  });

  if (!file) {
    return { status: false, message: "File not found" };
  }

  try {
    await prisma.file.update({
      where: { id: fileId },
      data: { currentPage: page },
    });
  } catch (e) {
    return { status: false, message: "Failed to update file." };
  }

  return { status: true };
};

export const getFile = async (fileId: number) => {
  const file = await prisma.file.findUnique({
    where: {
      id: fileId,
    },
  });

  if (!file) {
    return { status: false, message: "File not found" };
  }

  return { status: true, file };
};

export const deleteAllFiles = async (seriesId: number) => {
  console.log(`Deleting all files for series ${seriesId}`);

  const files = await prisma.file.findMany({
    where: { seriesId },
  });

  console.log(`Found ${files.length} files to delete`);

  for (const file of files) {
    await deleteFile(file.id);
  }

  console.log(`Deleted ${files.length} files`);

  return { status: true };
};

export const deleteFile = async (fileId: number) => {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
  });

  if (!file) {
    return { status: false, message: "File not found" };
  }

  try {
    fs.unlinkSync(file.path);
  } catch (e) {
    console.log("Failed to delete file", e);
  }

  try {
    fs.unlinkSync(
      `./assets/series/${file.seriesId}/previews/${file.fileName}.jpg`
    );
  } catch (e) {
    console.log("Failed to delete preview", e);
  }

  await prisma.file.delete({
    where: { id: fileId },
  });

  return { status: true, file };
};

export const getCoverImage = async (libraryId: number, seriesId: number) => {
  const library = await prisma.library.findUnique({
    where: { id: libraryId },
  });

  const coverPath = `${library?.path}/.mangadevourer/series/${seriesId}/cover.jpg`;
  return coverPath;
};

export const getPreviewImage = async (
  libraryId: number,
  seriesId: number,
  fileId: number
) => {
  const library = await prisma.library.findUnique({
    where: { id: libraryId },
  });

  const file = await prisma.file.findUnique({
    where: { id: fileId },
  });

  if (!file) {
    return false;
  }

  const previewPath = `${library?.path}/.mangadevourer/series/${seriesId}/previews/${file.fileName}.jpg`;
  return previewPath;
};

export const markAllFilesAsRead = async (seriesId: number) => {
  const files = await prisma.file.findMany({
    where: { seriesId },
  });

  for (const file of files) {
    await markAsRead(file.id);
  }

  return { status: true };
};

export const markAsRead = async (fileId: number) => {
  const file = await prisma.file.findUnique({
    where: {
      id: fileId,
    },
  });

  if (!file) {
    return { status: false, message: "File not found" };
  }

  try {
    await prisma.file.update({
      where: { id: fileId },
      data: { isRead: true, currentPage: file.totalPages },
    });

    return { status: true };
  } catch (e) {
    return { status: false, message: "File not found" };
  }
};

export const convertRarToZip = async (archivePath: string) => {
  const uuid = uuidv4();
  const targetPath = `./assets/tmp/${uuid}`;

  try {
    fs.mkdirSync(targetPath, { recursive: true });
  } catch (e) {
    console.log("Failed to remove tmp/stream directory", e);
  }

  try {
    const extractor = await createExtractorFromFile({
      filepath: archivePath,
      targetPath: targetPath,
    });

    [...extractor.extract().files];
  } catch (error) {
    console.error("Error during extraction:", error);
  }

  console.log(`Path: ${archivePath}`);
  console.log(`Target Path: ./assets/tmp/${uuid}`);

  const zip = new JSZip();

  const addFilesToZip = (dirPath: string, zipFolder: JSZip) => {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        const folder = zipFolder.folder(file) as any;
        addFilesToZip(filePath, folder);
      } else {
        const fileData = fs.readFileSync(filePath);
        zipFolder.file(file, fileData);
      }
    }
  };

  addFilesToZip(targetPath, zip);

  const writeStream = fs.createWriteStream(`./assets/tmp/${uuid}.zip`);

  zip
    .generateNodeStream({ type: "nodebuffer", streamFiles: true })
    .pipe(writeStream);

  await finished(writeStream);

  try {
    fs.rmdirSync(`./assets/tmp/${uuid}`, { recursive: true });
  } catch (e) {
    console.log("Failed to remove tmp/stream directory", e);
  }

  return { path: `./assets/tmp/${uuid}.zip`, fileName: `${uuid}.zip` };
};

export const extractChapterAndVolume = (fileName: string) => {
  const result: { chapter?: number; volume?: number } = {};

  // Match volume patterns
  const volumePatterns = [/v(?:ol(?:ume)?)?\.?\s*(\d+)/i, /\(v(\d+)\)/i];

  // Match chapter patterns
  const chapterPatterns = [/ch(?:apter)?\.?\s*(\d+\.?\d*)/i, /c(\d+\.?\d*)/i];

  for (const pattern of volumePatterns) {
    const match = fileName.match(pattern);
    if (match) {
      result.volume = parseInt(match[1]);
      break;
    }
  }

  for (const pattern of chapterPatterns) {
    const match = fileName.match(pattern);
    if (match) {
      result.chapter = parseFloat(match[1]);
      break;
    }
  }

  return result;
};

export const processNewFile = async (
  filePath: string,
  targetPath: string,
  tmpDir: string
) => {
  try {
    const extension = filePath.split(".").pop();
    const normalizedFilePath = path.normalize(filePath);

    let firstImage = null;
    let pageCount = 0;

    switch (extension) {
      case "cbz":
        {
          const zipResult = await processNewZip(normalizedFilePath);
          pageCount = zipResult.totalPages;
          firstImage = zipResult.firstImage;
        }
        break;
      case "zip":
        {
          const zipResult = await processNewZip(normalizedFilePath);
          pageCount = zipResult.totalPages;
          firstImage = zipResult.firstImage;
        }
        break;
      case "cbr":
        {
          const rarResult = await processNewRar(normalizedFilePath, tmpDir);
          pageCount = rarResult.totalPages;
          firstImage = rarResult.firstImage;
        }
        break;
      case "rar":
        {
          const rarResult = await processNewRar(normalizedFilePath, tmpDir);
          pageCount = rarResult.totalPages;
          firstImage = rarResult.firstImage;
        }
        break;
      case "cb7":
        {
          const rarResult = await processNew7z(
            normalizedFilePath,
            targetPath,
            tmpDir
          );
          pageCount = rarResult.totalPages;
          firstImage = rarResult.firstImage;
        }
        break;
      case "7z":
        {
          const rarResult = await processNew7z(
            normalizedFilePath,
            targetPath,
            tmpDir
          );
          pageCount = rarResult.totalPages;
          firstImage = rarResult.firstImage;
        }
        break;
    }

    return { pageCount, firstImage };
  } catch (e) {
    console.log("Failed to process file", e);
    return false;
  }
};

export const processNewZip = async (path: string) => {
  console.log(`Processing zip file: ${path}`);

  const zip = new JSZip();

  const buffer = fs.readFileSync(path);
  const zipFile = await zip.loadAsync(buffer);
  const files = Object.values(zipFile.files);

  const validFiles = files.filter((file) => {
    const extension = file.name.split(".").pop()?.toLowerCase() as string;
    return validImageExtensions.includes(extension);
  });

  if (validFiles.length === 0) {
    throw new Error("no valid images found");
  }

  validFiles.sort((a, b) => a.name.localeCompare(b.name));

  const firstImage = validFiles[0];

  const firstImageData = await firstImage.async("nodebuffer");
  const convertedImage = await convertImageToJpg(firstImageData);

  return {
    totalPages: Number(validFiles.length),
    firstImage: convertedImage,
  };
};

export const processNewRar = async (path: string, tmpDir: string) => {
  const extractor = await createExtractorFromFile({
    filepath: path,
    targetPath: tmpDir,
  });

  const files = extractor.getFileList();
  const fileList = files.fileHeaders;
  const fileArray = [];

  for (const f of fileList) {
    if (
      validImageExtensions.includes(
        f.name.split(".").pop()?.toLowerCase() as string
      )
    ) {
      fileArray.push(f);
    }
  }

  if (fileArray.length === 0) {
    throw new Error("no valid images found");
  }

  fileArray.sort((a, b) => a.name.localeCompare(b.name));

  for (const file of fileArray) {
    if (!file.flags.directory) {
      const extractionResult = extractor.extract({ files: [file.name] });
      for (const extractedFile of extractionResult.files) {
        if (extractedFile.fileHeader.name === file.name) {
          const extractedFilePath = `${tmpDir}/${file.name}`;
          const extractedFileBuffer = fs.readFileSync(extractedFilePath);

          console.log("Extracted file path: ", extractedFilePath);

          console.log(
            "Extracted file buffer size: ",
            Buffer.byteLength(extractedFileBuffer)
          );

          const convertedImage = await convertImageToJpg(extractedFileBuffer);

          fs.unlinkSync(extractedFilePath);

          const pathParts = file.name.split("/");
          if (pathParts.length > 1) {
            const dirPath = pathParts.slice(0, -1).join("/");
            fs.rmdirSync(`${tmpDir}/${dirPath}`, { recursive: true });
          }

          return { totalPages: fileArray.length, firstImage: convertedImage };
        }
      }
    }
  }

  throw new Error("Failed to extract any valid image files");
};

export const processNew7z = async (
  path: string,
  targetPath: string,
  tmpDir: string
) => {
  return { totalPages: 0, firstImage: null };
};

export const convertImageToJpg = async (imageData: Buffer) => {
  try {
    const isWebP =
      imageData.toString("ascii", 0, 4) === "RIFF" &&
      imageData.toString("ascii", 8, 12) === "WEBP";

    let width: number;
    let height: number;
    let imageToRender: any;

    if (isWebP) {
      const decoded = await webp.decode(imageData);
      imageToRender = decoded;
      width = decoded.width;
      height = decoded.height;
    } else {
      const img = await loadImage(imageData);
      imageToRender = img;
      width = img.width;
      height = img.height;
    }

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    if (isWebP) {
      ctx.putImageData(imageToRender, 0, 0);
    } else {
      ctx.drawImage(imageToRender, 0, 0);
    }

    if (!imageData.toString("ascii", 0, 2).startsWith("\xFF\xD8")) {
      return canvas.toBuffer("image/jpeg");
    }

    return imageData;
  } catch (error) {
    throw new Error(`Failed to convert image to JPEG: ${error}`);
  }
};

export const getRecentlyRead = async () => {
  const recentlyRead = await prisma.recentlyRead.findMany();

  if (recentlyRead.length === 0) {
    return { status: true, recentlyRead: [] };
  }

  let files: any[] = [];

  for (const entry of recentlyRead) {
    const file = await prisma.file.findUnique({
      select: {
        id: true,
        fileName: true,
        seriesId: true,
        currentPage: true,
        totalPages: true,
        volume: true,
        chapter: true,
        series: {
          select: {
            id: true,
            title: true,
            libraryId: true,
          },
        },
      },
      where: { id: entry.fileId },
    });

    if (file) {
      files.push(file);
    }
  }

  return { status: true, recentlyRead: files };
};

export const markRecentlyRead = async (
  libraryId: number,
  seriesId: number,
  fileId: number
) => {
  const library = await prisma.library.findUnique({
    where: { id: libraryId },
  });

  if (!library) {
    return { status: false, message: "Library not found" };
  }

  const file = await prisma.file.findUnique({
    where: { id: fileId, seriesId },
  });

  if (!file) {
    return { status: false, message: "File not found" };
  }

  await prisma.recentlyRead.deleteMany({
    where: {
      libraryId,
      seriesId,
      fileId,
    },
  });

  await prisma.recentlyRead.create({
    data: {
      isLocal: false,
      libraryId,
      seriesId,
      fileId,
      currentPage: file.currentPage,
      totalPages: file.totalPages,
      volume: file.volume,
      chapter: file.chapter,
    },
  });

  const allRecentlyRead = await prisma.recentlyRead.findMany({
    orderBy: {
      id: "desc",
    },
  });

  if (allRecentlyRead.length > 5) {
    const idsToDelete = allRecentlyRead.slice(5).map((entry) => entry.id);
    await prisma.recentlyRead.deleteMany({
      where: {
        id: {
          in: idsToDelete,
        },
      },
    });
  }

  return { status: true };
};
