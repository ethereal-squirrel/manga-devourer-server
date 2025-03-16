import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import JSZip from "jszip";

import { convertRarToZip } from "./file";
import { prisma } from "../prisma";

export const getTopLevelFolders = (dirPath: string) => {
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
};

export const getAllFiles = (dirPath: string): string[] => {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const arrayOfFiles: string[] = [];
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles.push(...getAllFiles(fullPath));
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
};

export const streamFile = async (fileId: string) => {
  const file = await prisma.file.findUnique({
    where: { id: Number(fileId) },
  });

  if (!file) {
    return { status: false, message: "File not found" };
  }

  switch (file.fileFormat) {
    case "folder": {
      const zip = new JSZip();
      const files = getAllFiles(file.path);

      for (const filePath of files) {
        const relativePath = path.relative(file.path, filePath);
        const content = await fs.promises.readFile(filePath);
        zip.file(relativePath, content);
      }
      7;

      const tmpPath = path.join(os.tmpdir(), `${file.id}_${Date.now()}.zip`);
      await fs.promises.writeFile(
        tmpPath,
        await zip.generateAsync({ type: "nodebuffer" })
      );

      return {
        fileName: `${path.basename(file.path)}.zip`,
        filePath: tmpPath,
        temporary: true,
      };
    }
    case "cbr":
    case "rar": {
      const fileDetails = await convertRarToZip(file.path);
      return {
        fileName: file.fileName,
        filePath: fileDetails.path,
        temporary: true,
      };
    }
    case "cbz":
    case "zip": {
      return {
        fileName: file.fileName,
        filePath: file.path,
        temporary: false,
        directSend: true,
      };
    }
    default:
      return {
        fileName: file.fileName,
        filePath: file.path,
        temporary: false,
      };
  }
};

export const streamFileFromDatabase = async (fileId: string) => {
  const file = await prisma.file.findUnique({
    where: { id: Number(fileId) },
  });

  if (!file) {
    return { status: false, message: "File not found" };
  }

  switch (file.fileFormat) {
    case "cbr":
    case "rar": {
      const fileDetails = await convertRarToZip(file.path);
      return {
        fileName: file.fileName,
        filePath: fileDetails.path,
        temporary: true,
      };
    }
    case "cbz":
    case "zip": {
      return {
        fileName: file.fileName,
        filePath: file.path,
        temporary: false,
        directSend: true,
      };
    }
    case "folder": {
      // @TODO: Zip folder.
    }
  }
};
