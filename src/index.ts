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

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

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

async function handleCommand(command: string, args: string[]) {
  switch (command) {
    case "create-library":
      {
        const libraryName = args[0];
        const libraryPath = args[1];

        if (
          !libraryName ||
          !libraryPath ||
          libraryName.length === 0 ||
          libraryPath.length === 0
        ) {
          console.error("Invalid library name or path");
          process.exit(1);
        }

        console.log(
          `[Command] Creating library ${libraryName} at ${libraryPath}`
        );
        fetch(`http://localhost:${port}/libraries`, {
          method: "POST",
          body: JSON.stringify({ name: libraryName, path: libraryPath }),
        });
      }
      break;
    case "scan-library":
      {
        const libraryId = parseInt(args[0]);
        if (isNaN(libraryId)) {
          console.error("Invalid library ID");
          process.exit(1);
        }

        console.log(`[Command] Scanning library ${libraryId}`);
        fetch(`http://localhost:${port}/library/${libraryId}/scan`, {
          method: "POST",
        });
      }
      break;
    case "scan-status":
      {
        const libraryId = parseInt(args[0]);
        if (isNaN(libraryId)) {
          console.error("Invalid library ID");
          process.exit(1);
        }

        console.log(
          `[Command] Retrieving scan status for library ${libraryId}`
        );

        const res = await fetch(
          `http://localhost:${port}/library/${libraryId}/scan-status`,
          {
            method: "GET",
          }
        );
        const data = await res.json();
        console.log(data);
      }
      break;
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
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

const args = process.argv.slice(2);

if (args.length === 0) {
  startApp();
} else {
  const [command, ...commandArgs] = args;
  handleCommand(command, commandArgs).catch((error) => {
    console.error("Command failed:", error);
    process.exit(1);
  });
}
