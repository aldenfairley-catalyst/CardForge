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

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  console.log(`Forge backend listening on http://localhost:${port}`);
});
