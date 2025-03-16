import { Router, Request, Response } from "express";
import { checkAuth } from "../lib/auth";
import { deleteSeries, getFilesBySeriesId, getSeries } from "../lib/series";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError, ApiResponse, SeriesResponse, SeriesFilesResponse } from "../types/api";

const router = Router();

router.get("/series/:id", checkAuth, asyncHandler(async (req: Request, res: Response<SeriesResponse>) => {
  const seriesId = Number(req.params.id);
  if (isNaN(seriesId)) {
    throw new ApiError(400, "Invalid series ID");
  }

  const response = await getSeries(seriesId);
  if (!response.status) {
    throw new ApiError(404, "Series not found");
  }

  res.json(response);
}));

router.delete("/series/:id", checkAuth, asyncHandler(async (req: Request, res: Response<ApiResponse>) => {
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
}));

router.get("/series/:id/files", checkAuth, asyncHandler(async (req: Request, res: Response<SeriesFilesResponse>) => {
  const seriesId = Number(req.params.id);
  if (isNaN(seriesId)) {
    throw new ApiError(400, "Invalid series ID");
  }

  const response = await getFilesBySeriesId(seriesId);
  if (!response.status || !response.files) {
    throw new ApiError(404, "No files found for series");
  }

  res.json(response);
}));

export default router;
