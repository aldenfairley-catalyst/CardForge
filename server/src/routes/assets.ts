import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { nanoid } from "nanoid";
import type { DbContext } from "../db";

const upload = multer({ storage: multer.memoryStorage() });

function guessExt(mime: string | undefined, fallbackName?: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (fallbackName && fallbackName.includes(".")) return fallbackName.split(".").pop() ?? "bin";
  return "bin";
}

function dataUrlToBuffer(dataUrl: string) {
  const match = /^data:(.*?);base64,(.*)$/.exec(dataUrl);
  if (!match) throw new Error("Invalid data URL");
  const mime = match[1] || "application/octet-stream";
  const buffer = Buffer.from(match[2], "base64");
  return { mime, buffer };
}

export function createAssetRouter(getDb: () => DbContext) {
  const router = Router();

  router.post("/", upload.single("file"), (req, res) => {
    try {
      const ctx = getDb();
      let buffer: Buffer | null = null;
      let mime: string | undefined;
      let ext: string | undefined;

      if (req.file) {
        buffer = req.file.buffer;
        mime = req.file.mimetype;
        ext = guessExt(mime, req.file.originalname);
      } else if (typeof req.body?.dataUrl === "string") {
        const parsed = dataUrlToBuffer(req.body.dataUrl);
        buffer = parsed.buffer;
        mime = parsed.mime;
        ext = guessExt(mime);
      }

      if (!buffer) return res.status(400).json({ error: "No file or dataUrl provided" });

      const id = nanoid();
      const filename = `${id}.${ext || "bin"}`;
      const relPath = path.join("assets", filename);
      const absPath = path.join(ctx.projectDir, relPath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, buffer);

      const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
      const now = Date.now();
      ctx.db
        .prepare(
          `INSERT OR REPLACE INTO assets (id, mime, ext, sha256, byteSize, path, createdAt)
           VALUES (@id, @mime, @ext, @sha256, @byteSize, @path, @createdAt)`
        )
        .run({
          id,
          mime: mime ?? "application/octet-stream",
          ext: ext ?? "bin",
          sha256,
          byteSize: buffer.length,
          path: relPath,
          createdAt: now
        });

      res.json({ assetId: id, url: `/api/assets/${id}` });
    } catch (err: any) {
      res.status(500).json({ error: err?.message ?? "Upload failed" });
    }
  });

  router.get("/:id", (req, res) => {
    const ctx = getDb();
    const row = ctx.db.prepare("SELECT * FROM assets WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Asset not found" });
    const absPath = path.join(ctx.projectDir, row.path);
    if (!fs.existsSync(absPath)) return res.status(404).json({ error: "Asset file missing" });
    res.sendFile(absPath, { headers: { "Content-Type": row.mime ?? "application/octet-stream" } });
  });

  router.delete("/:id", (req, res) => {
    const ctx = getDb();
    const row = ctx.db.prepare("SELECT * FROM assets WHERE id = ?").get(req.params.id);
    if (row) {
      const absPath = path.join(ctx.projectDir, row.path);
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
      ctx.db.prepare("DELETE FROM assets WHERE id = ?").run(req.params.id);
    }
    res.json({ ok: true });
  });

  return router;
}
