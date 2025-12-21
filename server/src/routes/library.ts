import { Router } from "express";
import type { DbContext } from "../db";
import { nanoid } from "nanoid";

export function createLibraryRouter(getDb: () => DbContext) {
  const router = Router();

  router.get("/", (_req, res) => {
    const { db } = getDb();
    const rows = db.prepare("SELECT * FROM action_library ORDER BY updatedAt DESC").all();
    res.json({
      entries: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        name: r.name,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        json: parseSafe(r.json)
      }))
    });
  });

  router.put("/:id", (req, res) => {
    const { db } = getDb();
    const payload = req.body?.entry ?? req.body;
    const id = req.params.id || payload?.id || nanoid();
    const now = Date.now();
    const existing = db.prepare("SELECT createdAt FROM action_library WHERE id = ?").get(id) as any;
    const createdAt = existing?.createdAt ?? now;
    db.prepare(
      `INSERT OR REPLACE INTO action_library (id, kind, name, json, createdAt, updatedAt)
       VALUES (@id, @kind, @name, @json, @createdAt, @updatedAt)`
    ).run({
      id,
      kind: payload?.kind ?? payload?.json?.kind ?? "UNKNOWN",
      name: payload?.name ?? payload?.json?.name ?? "Library Entry",
      json: JSON.stringify(payload?.json ?? payload ?? {}),
      createdAt,
      updatedAt: now
    });
    res.json({ id, createdAt, updatedAt: now });
  });

  router.delete("/:id", (req, res) => {
    const { db } = getDb();
    db.prepare("DELETE FROM action_library WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}

function parseSafe(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
