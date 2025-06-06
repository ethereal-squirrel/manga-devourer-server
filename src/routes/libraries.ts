import { Router, Request, Response } from "express";
import fs from "fs";

import { checkAuth } from "../lib/auth";
import {
  createCollection,
  deleteCollection,
  getCollection,
  getCollections,
  getLibrary,
  getScanStatus,
  addSeriesToCollection,
  removeSeriesFromCollection,
  scanLibrary,
} from "../lib/library";
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
    const librariesData: any[] = [];
    const libraries = await prisma.library.findMany();

    for (const library of libraries) {
      const series = await prisma.series.findMany({
        select: {
          id: true,
          cover: true,
        },
        where: { libraryId: library.id },
        take: 5,
      });

      librariesData.push({
        ...library,
        series,
        seriesCount: await prisma.series.count({
          where: { libraryId: library.id },
        }),
      });
    }

    res.json({
      status: true,
      libraries: librariesData,
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

libraryRouter.delete(
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

    await prisma.file.deleteMany({
      where: {
        series: {
          libraryId,
        },
      },
    });

    await prisma.series.deleteMany({
      where: {
        libraryId,
      },
    });

    await prisma.library.delete({
      where: {
        id: libraryId,
      },
    });

    res.json({
      status: true,
      message: "Library deleted successfully",
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

libraryRouter.get(
  "/library/:id/collections",
  checkAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const libraryId = Number(req.params.id);

    if (isNaN(libraryId)) {
      throw new ApiError(400, "Invalid library ID");
    }

    const response = await getCollections(libraryId);
    res.json(response);
  })
);

libraryRouter.post(
  "/library/:id/collections",
  checkAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const libraryId = Number(req.params.id);

    if (isNaN(libraryId)) {
      throw new ApiError(400, "Invalid library ID");
    }

    const response = await createCollection(libraryId, req.body.name);
    res.json(response);
  })
);

libraryRouter.get(
  "/library/collections/:collectionId",
  checkAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const collectionId = Number(req.params.collectionId);

    if (isNaN(collectionId)) {
      throw new ApiError(400, "Invalid collection ID");
    }

    const response = await getCollection(collectionId);
    res.json(response);
  })
);

libraryRouter.delete(
  "/library/collections/:collectionId",
  checkAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const collectionId = Number(req.params.collectionId);

    if (isNaN(collectionId)) {
      throw new ApiError(400, "Invalid collection ID");
    }

    const response = await deleteCollection(collectionId);
    res.json(response);
  })
);

libraryRouter.post(
  "/library/collections/:collectionId/:libraryId/:seriesId",
  checkAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const collectionId = Number(req.params.collectionId);
    const libraryId = Number(req.params.libraryId);
    const seriesId = Number(req.params.seriesId);

    if (isNaN(collectionId)) {
      throw new ApiError(400, "Invalid collection ID");
    }

    if (isNaN(libraryId)) {
      throw new ApiError(400, "Invalid library ID");
    }

    if (isNaN(seriesId)) {
      throw new ApiError(400, "Invalid series ID");
    }

    const response = await addSeriesToCollection(
      collectionId,
      libraryId,
      seriesId
    );
    res.json(response);
  })
);

libraryRouter.delete(
  "/library/collections/:collectionId/:libraryId/:seriesId",
  checkAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const collectionId = Number(req.params.collectionId);
    const libraryId = Number(req.params.libraryId);
    const seriesId = Number(req.params.seriesId);

    if (isNaN(collectionId)) {
      throw new ApiError(400, "Invalid collection ID");
    }

    if (isNaN(libraryId)) {
      throw new ApiError(400, "Invalid library ID");
    }

    if (isNaN(seriesId)) {
      throw new ApiError(400, "Invalid series ID");
    }

    const response = await removeSeriesFromCollection(
      collectionId,
      libraryId,
      seriesId
    );
    res.json(response);
  })
);

export default libraryRouter;
