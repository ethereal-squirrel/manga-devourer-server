import { Router, Request, Response } from "express";
import fs from "fs";

import { checkAuth } from "../lib/auth";
import { getLibrary, getScanStatus, scanLibrary } from "../lib/library";
import { asyncHandler } from "../middleware/asyncHandler";
import {
  ApiError,
  LibraryResponse,
  LibraryScanResponse,
  LibraryScanStatusResponse,
} from "../types/api";
import { prisma } from "../lib/prisma";

export const libraryRouter = Router();

libraryRouter.get(
  "/libraries",
  checkAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const libraries = await prisma.library.findMany();
    res.json({
      status: true,
      libraries,
    });
  })
);

libraryRouter.post(
  "/libraries",
  checkAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { name, path } = req.body;
    if (!name || !path) {
      throw new ApiError(400, "Name and path are required");
    }

    if (!fs.existsSync(path)) {
      throw new ApiError(400, "Library path does not exist");
    }

    const library = await prisma.library.create({
      data: { name, path },
    });

    res.status(201).json({
      status: true,
      library,
    });
  })
);

libraryRouter.get(
  "/library/:id",
  checkAuth,
  asyncHandler(async (req: Request, res: Response<LibraryResponse>) => {
    const libraryId = Number(req.params.id);
    if (isNaN(libraryId)) {
      throw new ApiError(400, "Invalid library ID");
    }

    const response = await getLibrary(req.params.id);
    if (!response.status || !response.library) {
      throw new ApiError(404, "Library not found");
    }

    res.json({
      ...response,
      library: response.library || undefined,
    });
  })
);

libraryRouter.post(
  "/library/:id/scan",
  checkAuth,
  asyncHandler(async (req: Request, res: Response<LibraryScanResponse>) => {
    const libraryId = Number(req.params.id);
    if (isNaN(libraryId)) {
      throw new ApiError(400, "Invalid library ID");
    }

    const response = await scanLibrary(libraryId);
    if (!response.status) {
      const errorMessage = response.message || "Unknown error";
      const statusCode = errorMessage.includes("in progress") ? 409 : 404;
      throw new ApiError(statusCode, errorMessage);
    }

    res.json({
      status: response.status,
      message: response.message || "Scan started",
      inProgress: response.inProgress || false,
      remaining: response.remaining || [],
    });
  })
);

libraryRouter.get(
  "/library/:id/scan-status",
  checkAuth,
  asyncHandler(
    async (req: Request, res: Response<LibraryScanStatusResponse>) => {
      const libraryId = Number(req.params.id);
      if (isNaN(libraryId)) {
        throw new ApiError(400, "Invalid library ID");
      }

      const response = await getScanStatus(libraryId);
      res.json({
        status: response.status,
        message: response.message || "",
        inProgress: response.inProgress || false,
        progress: response.progress,
        startTime: response.startTime,
        remaining: response.remaining || [],
      });
    }
  )
);

export default libraryRouter;
