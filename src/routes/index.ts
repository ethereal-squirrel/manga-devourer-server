import { Router, Request, Response } from "express";
import librariesRouter from "./libraries";
import seriesRouter from "./series";
import filesRouter from "./files";
import imagesRouter from "./images";
import authRouter from "./auth";

const router = Router();

router.get("/", (req: Request, res: Response) => {
  res.send("Manga Devourer Server");
});

router.use(librariesRouter);
router.use(seriesRouter);
router.use(filesRouter);
router.use(imagesRouter);
router.use(authRouter);

export default router;
