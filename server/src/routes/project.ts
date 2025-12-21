import { Router } from "express";
import path from "path";
import fs from "fs";
import { getDb, openProject } from "../db";

export function createProjectRouter() {
  const router = Router();

  router.post("/open", (req, res) => {
    const bodyPath = req.body?.path;
    if (!bodyPath) return res.status(400).json({ error: "path is required" });
    const ctx = openProject(bodyPath);
    res.json({ projectPath: ctx.projectPath, assetsDir: ctx.assetsDir });
  });

  router.post("/new", (req, res) => {
    const folder = req.body?.folder;
    const name = req.body?.name ?? "forge";
    if (!folder) return res.status(400).json({ error: "folder is required" });
    const projectDir = path.resolve(folder, name);
    fs.mkdirSync(projectDir, { recursive: true });
    const dbPath = path.join(projectDir, "forge.sqlite");
    const ctx = openProject(dbPath);
    res.json({ projectPath: ctx.projectPath, assetsDir: ctx.assetsDir });
  });

  router.get("/current", (_req, res) => {
    try {
      const ctx = getDb();
      res.json({ projectPath: ctx.projectPath, assetsDir: ctx.assetsDir });
    } catch {
      res.status(404).json({ error: "No project loaded" });
    }
  });

  return router;
}
