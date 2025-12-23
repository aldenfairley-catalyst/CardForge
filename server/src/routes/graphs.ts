import { Router } from "express";
import { nanoid } from "nanoid";
import type { DbContext } from "../db";

export function createGraphRouter(getDb: () => DbContext) {
  const router = Router();

  router.get("/", (req, res) => {
    const { db } = getDb();
    const kind = String(req.query.kind ?? "").trim();
    const clauses: string[] = [];
    const params: any[] = [];
    if (kind) {
      clauses.push("kind = ?");
      params.push(kind);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = db
      .prepare(`SELECT id, name, kind, ownerRef, schemaVersion, createdAt, updatedAt FROM graphs ${where} ORDER BY updatedAt DESC`)
      .all(...params);
    res.json({ graphs: rows });
  });

  router.get("/:id", (req, res) => {
    const { db } = getDb();
    const row = db.prepare("SELECT * FROM graphs WHERE id = ?").get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: "Graph not found" });
    const json = typeof row.json === "string" ? JSON.parse(row.json) : row.json;
    res.json({ ...row, json });
  });

  router.post("/", (req, res) => {
    const { db } = getDb();
    const graph = req.body?.graph ?? req.body;
    const id = graph?.id || nanoid();
    const now = Date.now();
    const existing = db.prepare("SELECT createdAt FROM graphs WHERE id = ?").get(id) as any;
    const createdAt = existing?.createdAt ?? now;
    db.prepare(
      `INSERT OR REPLACE INTO graphs (id, name, kind, ownerRef, schemaVersion, json, createdAt, updatedAt)
       VALUES (@id, @name, @kind, @ownerRef, @schemaVersion, @json, @createdAt, @updatedAt)`
    ).run({
      id,
      name: graph?.name ?? "Graph",
      kind: graph?.kind ?? "card_action",
      ownerRef: graph?.ownerRef ?? null,
      schemaVersion: graph?.schemaVersion ?? graph?.graphVersion ?? null,
      json: JSON.stringify(graph ?? {}),
      createdAt,
      updatedAt: now
    });
    res.json({ id, createdAt, updatedAt: now });
  });

  router.put("/:id", (req, res) => {
    const { db } = getDb();
    const graph = req.body?.graph ?? req.body;
    const id = req.params.id;
    const now = Date.now();
    const existing = db.prepare("SELECT createdAt FROM graphs WHERE id = ?").get(id) as any;
    const createdAt = existing?.createdAt ?? now;
    db.prepare(
      `INSERT OR REPLACE INTO graphs (id, name, kind, ownerRef, schemaVersion, json, createdAt, updatedAt)
       VALUES (@id, @name, @kind, @ownerRef, @schemaVersion, @json, @createdAt, @updatedAt)`
    ).run({
      id,
      name: graph?.name ?? "Graph",
      kind: graph?.kind ?? "card_action",
      ownerRef: graph?.ownerRef ?? null,
      schemaVersion: graph?.schemaVersion ?? graph?.graphVersion ?? null,
      json: JSON.stringify(graph ?? {}),
      createdAt,
      updatedAt: now
    });
    res.json({ id, createdAt, updatedAt: now });
  });

  return router;
}
