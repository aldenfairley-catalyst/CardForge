import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import { getDb } from "./db";
import { createCardRouter } from "./routes/cards";
import { createDeckRouter } from "./routes/decks";
import { createScenarioRouter } from "./routes/scenarios";
import { createAssetRouter } from "./routes/assets";
import { createCatalogRouter } from "./routes/catalogs";
import { createLibraryRouter } from "./routes/library";
import { createAiRouter } from "./routes/ai";
import { createProjectRouter } from "./routes/project";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

// Ensure a project is ready
getDb();

app.use("/api/project", createProjectRouter());
app.use("/api/cards", createCardRouter(getDb));
app.use("/api/decks", createDeckRouter(getDb));
app.use("/api/scenarios", createScenarioRouter(getDb));
app.use("/api/assets", createAssetRouter(getDb));
app.use("/api/catalogs", createCatalogRouter(getDb));
app.use("/api/library", createLibraryRouter(getDb));
app.use("/api/ai", createAiRouter());

// Optional static serving of built client
const distDir = path.join(process.cwd(), "dist");
app.use(express.static(distDir));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  const htmlPath = path.join(distDir, "index.html");
  res.sendFile(htmlPath, (err) => {
    if (err) next();
  });
});

const preferredPort = Number(process.env.PORT) || 8787;
const candidatePorts = Array.from(new Set([preferredPort, preferredPort + 1, preferredPort + 2]));

function listenOnPort(index: number) {
  const port = candidatePorts[index];
  const server = app.listen(port, () => {
    console.log(`Forge backend listening on http://localhost:${port}`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && index + 1 < candidatePorts.length) {
      const nextPort = candidatePorts[index + 1];
      console.warn(`Port ${port} is in use, attempting ${nextPort}...`);
      listenOnPort(index + 1);
      return;
    }

    console.error(`Failed to start server on port ${port}:`, err);
    process.exit(1);
  });
}

listenOnPort(0);
