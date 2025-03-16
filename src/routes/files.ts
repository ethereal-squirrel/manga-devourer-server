import { Router, Request, Response } from "express";
import fs from "fs";
import { checkAuth } from "../lib/auth";
import {
  deleteFile,
  getFile,
  markAllFilesAsRead,
  markAsRead,
  pageEvent,
} from "../lib/file";
import { streamFile } from "../lib/filesystem";
import { asyncHandler } from "../middleware/asyncHandler";
import { prisma } from "../lib/prisma";
import {
  ApiError,
  FileResponse,
  FileUpdateResponse,
  PageEventRequest,
  PageEventResponse,
} from "../types/api";

export const filesRouter = Router();

filesRouter.get(
  "/file/:id",
  checkAuth,
  asyncHandler(async (req: Request, res: Response<FileResponse>) => {
    const fileId = Number(req.params.id);
    if (isNaN(fileId)) {
      throw new ApiError(400, "Invalid file ID");
    }

    const response = await getFile(fileId);
    if (!response.file) {
      throw new ApiError(404, "File not found");
    }

    res.json(response);
  })
);

filesRouter.delete(
  "/file/:id",
  checkAuth,
  asyncHandler(async (req: Request, res: Response<FileUpdateResponse>) => {
    const fileId = Number(req.params.id);
    if (isNaN(fileId)) {
      throw new ApiError(400, "Invalid file ID");
    }

    const response = await deleteFile(fileId);
    if (!response.status) {
      throw new ApiError(404, response.message || "File not found");
    }

    res.json(response);
  })
);

filesRouter.get(
  "/get-file/:id",
  checkAuth,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const fileId = Number(req.params.id);
      if (isNaN(fileId)) {
        throw new ApiError(400, "Invalid file ID");
      }

      const file = await prisma.file.findUnique({
        where: { id: fileId },
      });

      if (!file) {
        throw new ApiError(404, "File not found");
      }

      const streamResult = await streamFile(fileId.toString());
      if (!streamResult.status && streamResult.message) {
        throw new ApiError(404, streamResult.message);
      }

      if ("directSend" in streamResult && streamResult.directSend) {
        return res.sendFile(streamResult.filePath);
      }

      const { fileName, filePath } = streamResult;
      if (!filePath) {
        throw new ApiError(500, "Invalid file path");
      }

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`
      );

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);

      stream.on("error", (error: Error) => {
        console.error("Stream error:", error);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      if ("temporary" in streamResult && streamResult.temporary && filePath) {
        stream.on("finish", () => {
          fs.unlink(filePath, (err) => {
            if (err) console.error("Error deleting temporary file:", err);
          });
        });
      }
    } catch (error) {
      console.error("Error in get-file:", error);
      throw error;
    }
  })
);

filesRouter.post(
  "/mark-as-read",
  checkAuth,
  asyncHandler(async (req: Request, res: Response<FileUpdateResponse>) => {
    const fileId = Number(req.body.fileId);
    if (isNaN(fileId)) {
      throw new ApiError(400, "Invalid file ID");
    }

    const response = await markAsRead(fileId);
    if (!response.status) {
      throw new ApiError(404, response.message || "File not found");
    }

    res.json(response);
  })
);

filesRouter.post(
  "/mark-all-as-read",
  checkAuth,
  asyncHandler(async (req: Request, res: Response<FileUpdateResponse>) => {
    const seriesId = Number(req.body.seriesId);
    if (isNaN(seriesId)) {
      throw new ApiError(400, "Invalid series ID");
    }

    try {
      const response = await markAllFilesAsRead(seriesId);
      res.json(response);
    } catch (error) {
      throw new ApiError(500, "Failed to mark files as read");
    }
  })
);

filesRouter.post(
  "/page-event",
  checkAuth,
  asyncHandler(
    async (
      req: Request<any, any, PageEventRequest>,
      res: Response<PageEventResponse>
    ) => {
      const { fileId, page } = req.body;

      if (isNaN(fileId) || isNaN(page) || page < 0) {
        throw new ApiError(400, "Invalid file ID or page number");
      }

      const response = await pageEvent(fileId, page);
      if (!response.status) {
        throw new ApiError(404, response.message || "File not found");
      }

      res.json(response);
    }
  )
);

export default filesRouter;
