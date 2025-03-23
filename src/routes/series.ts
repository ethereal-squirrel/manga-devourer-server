import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";

import { checkAuth } from "../lib/auth";
import {
  deleteSeries,
  getFilesBySeriesId,
  getSeries,
  updateSeriesTitle,
  updateSeriesMangaData,
  updateSeriesImage,
} from "../lib/series";
import { asyncHandler } from "../middleware/asyncHandler";
import {
  ApiError,
  ApiResponse,
  SeriesResponse,
  SeriesFilesResponse,
} from "../types/api";

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 40 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

const router = Router();

router.get(
  "/series/:id",
  checkAuth,
  asyncHandler(async (req: Request, res: Response<SeriesResponse>) => {
    const seriesId = Number(req.params.id);
    if (isNaN(seriesId)) {
      throw new ApiError(400, "Invalid series ID");
    }

    const response = await getSeries(seriesId);
    if (!response.status) {
      throw new ApiError(404, "Series not found");
    }

    res.json(response);
  })
);

router.delete(
  "/series/:id",
  checkAuth,
  asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
    const seriesId = Number(req.params.id);
    if (isNaN(seriesId)) {
      throw new ApiError(400, "Invalid series ID");
    }

    try {
      const response = await deleteSeries(seriesId);
      res.json(response);
    } catch (error) {
      console.error(error);
      throw new ApiError(404, "Failed to delete series");
    }
  })
);

router.get(
  "/series/:id/files",
  checkAuth,
  asyncHandler(async (req: Request, res: Response<SeriesFilesResponse>) => {
    const seriesId = Number(req.params.id);
    if (isNaN(seriesId)) {
      throw new ApiError(400, "Invalid series ID");
    }

    const response = await getFilesBySeriesId(seriesId);
    if (!response.status || !response.files) {
      throw new ApiError(404, "No files found for series");
    }

    res.json(response);
  })
);

router.post(
  "/series/:id/title",
  checkAuth,
  asyncHandler(async (req: Request, res: Response<SeriesResponse>) => {
    const seriesId = Number(req.params.id);
    if (isNaN(seriesId)) {
      throw new ApiError(400, "Invalid series ID");
    }

    const { title } = req.body;
    if (!title) {
      throw new ApiError(400, "Title is required");
    }

    const response = await updateSeriesTitle(seriesId, title);
    if (!response.status) {
      throw new ApiError(404, "Series not found");
    }

    res.json(response);
  })
);

router.post(
  "/series/:id/mangaData",
  checkAuth,
  asyncHandler(async (req: Request, res: Response<SeriesResponse>) => {
    const seriesId = Number(req.params.id);
    if (isNaN(seriesId)) {
      throw new ApiError(400, "Invalid series ID");
    }

    const { mangaData } = req.body;
    if (!mangaData) {
      throw new ApiError(400, "Manga data is required");
    }

    const response = await updateSeriesMangaData(seriesId, mangaData);
    if (!response.status) {
      throw new ApiError(404, "Series not found");
    }

    res.json(response);
  })
);

router.post(
  "/series/:id/cover-image",
  checkAuth,
  upload.single("coverImage"), // Handle the file upload
  asyncHandler(async (req: Request, res: Response<SeriesResponse>) => {
    const seriesId = Number(req.params.id);
    if (isNaN(seriesId)) {
      throw new ApiError(400, "Invalid series ID");
    }

    if (!req.file) {
      throw new ApiError(400, "No image file provided");
    }

    // Pass the buffer directly to updateSeriesImage
    const response = await updateSeriesImage(seriesId, req.file.buffer);
    if (!response.status) {
      throw new ApiError(404, "Series not found");
    }

    res.json(response);
  })
);

export default router;
