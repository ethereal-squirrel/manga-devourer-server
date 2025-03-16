import { Router, Request, Response } from "express";
import { checkAuth, setAuth } from "../lib/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError, AuthRequest } from "../types/api";

const router = Router();

router.post("/set-auth", checkAuth, asyncHandler(async (req: Request<any, any, AuthRequest>, res: Response) => {
  const { authKey } = req.body;
  
  if (!authKey) {
    throw new ApiError(400, "Auth key is required");
  }

  const response = await setAuth(authKey);
  if (!response.status) {
    throw new ApiError(400, response.message || "Failed to set auth key");
  }

  res.json(response);
}));

export default router;
