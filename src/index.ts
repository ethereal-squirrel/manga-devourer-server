import dotenv from "dotenv";
import express, { Express } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";

import router from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { PrismaClient } from "@prisma/client";

declare global {
  namespace NodeJS {
    interface Process {
      pkg?: boolean;
    }
  }
}

if (process.pkg) {
  const basePath = process.cwd();
  process.env.DATABASE_URL = `file:${path.join(basePath, "devourer.db")}`;
  process.env.ASSETS_PATH = path.join(basePath, "assets");
} else {
  process.env.DATABASE_URL = `file:${path.join(
    __dirname,
    "../prisma/devourer.db"
  )}`;
  process.env.ASSETS_PATH = path.join(__dirname, "../assets");
}

dotenv.config();

const DATABASE_VERSION = 1;

export const app: Express = express();
const port = process.env.PORT || 9024;

app.use(express.json());
app.use(
  cors({
    exposedHeaders: ["X-File-Size"],
  })
);

app.use("/assets", express.static(process.env.ASSETS_PATH!));
app.use(router);
app.use(errorHandler);

async function initializeDatabase() {
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();

    const allTables = await prisma.$queryRaw`
      SELECT name 
      FROM sqlite_master 
      WHERE type='table'
    `;

    console.log(allTables);

    const tableExists = await prisma.$queryRaw`
      SELECT name 
      FROM sqlite_master 
      WHERE type='table' AND name='Config'
    `;

    if (!tableExists || (tableExists as any[]).length === 0) {
      console.log("Tables do not exist, running initial migration...");

      const migrationSql = fs.readFileSync(
        path.join(__dirname, `../migrations/1.sql`),
        "utf8"
      );
      const statements = migrationSql
        .split(";")
        .map((stmt) => stmt.trim())
        .filter((stmt) => stmt.length > 0);

      for (const statement of statements) {
        await prisma.$executeRawUnsafe(statement);
      }

      console.log("Initial migration executed successfully");

      await prisma.config.create({
        data: {
          key: "migration_version",
          value: "1",
        },
      });
    } else {
      const config = await prisma.config.findUnique({
        where: {
          key: "migration_version",
        },
      });

      if (config?.value !== DATABASE_VERSION.toString()) {
        console.log("Database is out of date, running migrations...");

        for (
          let i = parseInt(config?.value ?? "0") + 1;
          i <= DATABASE_VERSION;
          i++
        ) {
          const migrationSql = fs.readFileSync(
            path.join(__dirname, `../migrations/${i}.sql`),
            "utf8"
          );
          const statements = migrationSql
            .split(";")
            .map((stmt) => stmt.trim())
            .filter((stmt) => stmt.length > 0);

          for (const statement of statements) {
            await prisma.$executeRawUnsafe(statement);
          }
        }

        await prisma.config.update({
          where: {
            key: "migration_version",
          },
          data: {
            value: DATABASE_VERSION.toString(),
          },
        });

        console.log("Database migrations executed successfully");
      }
    }

    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Failed to initialize database:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function startApp() {
  try {
    await initializeDatabase();

    app.listen(port, () => {
      console.log(`[Server] Devourer is running on port ${port}`);
      console.log(`[Server] Database: ${process.env.DATABASE_URL}`);
      console.log(`[Server] Assets: ${process.env.ASSETS_PATH}`);
      if (process.pkg) {
        console.log(`[Server] Running in packaged mode`);
      }
    });
  } catch (error) {
    console.error("Failed to start app:", error);
    process.exit(1);
  }
}

startApp();
