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
import { createGraphRouter } from "./routes/graphs";
import { createRunRouter } from "./routes/run";
import { createActionsRouter } from "./routes/actions";

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
app.use("/api/graphs", createGraphRouter(getDb));
app.use("/api/actions", createActionsRouter(getDb));
app.use("/api/run", createRunRouter(getDb));

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

const preferredPort = Number(process.env.FORGE_SERVER_PORT ?? process.env.PORT ?? 8787);

const server = app.listen(preferredPort, () => {
  console.log(`Forge backend listening on http://localhost:${preferredPort}`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${preferredPort} is already in use. Set FORGE_SERVER_PORT to a free port (e.g., 8788) and restart both the server and Vite so the proxy target matches.`
    );
  } else {
    console.error(`Failed to start server on port ${preferredPort}:`, err);
  }
  process.exit(1);
});
