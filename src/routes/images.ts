import { Router, Request, Response } from "express";
import { getCoverImage, getPreviewImage } from "../lib/file";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../types/api";

const router = Router();

router.get(
  "/cover-image/:libraryId/:seriesId.jpg",
  asyncHandler(async (req: Request, res: Response) => {
    const libraryId = Number(req.params.libraryId);
    const seriesId = Number(req.params.seriesId);

    if (isNaN(libraryId) || isNaN(seriesId)) {
      throw new ApiError(400, "Invalid library ID or series ID");
    }

    const coverPath = await getCoverImage(libraryId, seriesId);
    if (!coverPath) {
      throw new ApiError(404, "Cover image not found");
    }

    res.sendFile(coverPath);
  })
);

router.get(
  "/preview-image/:libraryId/:seriesId/:fileId.jpg",
  asyncHandler(async (req: Request, res: Response) => {
    const libraryId = Number(req.params.libraryId);
    const seriesId = Number(req.params.seriesId);
    const fileId = Number(req.params.fileId);

    if (isNaN(libraryId) || isNaN(seriesId) || isNaN(fileId)) {
      throw new ApiError(400, "Invalid library ID, series ID, or file ID");
    }

    const previewPath = await getPreviewImage(libraryId, seriesId, fileId);
    if (!previewPath) {
      throw new ApiError(404, "Preview image not found");
    }

    res.sendFile(previewPath);
  })
);

export default router;
