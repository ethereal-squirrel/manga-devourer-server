import { Request, Response } from "express";

import { prisma } from "./prisma";

export const checkAuth = async (req: Request, res: Response, next: any) => {
  try {
    const configVar = await prisma.config.findFirst({
      where: {
        key: "authKey",
      },
    });

    if (!configVar) {
      next();
      return;
    }

    const token = req.headers.authorization as any;

    if (!token || token === undefined) {
      res.status(401).json({ status: false });
      return;
    }

    if (configVar?.value !== token) {
      res.status(401).json({ status: false });
      return;
    }

    next();
  } catch (error) {
    console.log(error);
    res.status(401).json({ status: false });
    return;
  }
};

export const setAuth = async (authKey: string) => {
  const configVar = await prisma.config.findFirst({
    where: {
      key: "authKey",
    },
  });

  if (configVar) {
    if (configVar.value !== authKey) {
      return { status: false, message: "Invalid auth key." };
    }
  }

  await prisma.config.upsert({
    where: { key: "authKey" },
    update: { value: authKey },
    create: { key: "authKey", value: authKey },
  });

  return { status: true, message: "Auth key set." };
};
