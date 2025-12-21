import { Router } from "express";
import { nanoid } from "nanoid";
import type { DbContext } from "../db";

export function createCardRouter(getDb: () => DbContext) {
  const router = Router();

  router.get("/", (req, res) => {
    const { db } = getDb();
    const search = String(req.query.search ?? "").trim().toLowerCase();
    const type = String(req.query.type ?? "").trim();
    const faction = String(req.query.faction ?? "").trim();
    const clauses: string[] = [];
    const params: any[] = [];

    if (search) {
      clauses.push("(LOWER(name) LIKE ? OR LOWER(json) LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    if (type) {
      clauses.push("type = ?");
      params.push(type);
    }
    if (faction) {
      clauses.push("faction = ?");
      params.push(faction);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const stmt = db.prepare(
      `SELECT id, name, type, faction, schemaVersion, createdAt, updatedAt FROM cards ${where} ORDER BY updatedAt DESC`
    );
    const rows = stmt.all(...params);
    res.json({ cards: rows });
  });

  router.get("/:id", (req, res) => {
    const { db } = getDb();
    const row = db.prepare("SELECT * FROM cards WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Card not found" });
    const json = typeof row.json === "string" ? JSON.parse(row.json) : row.json;
    res.json({ ...row, json });
  });

  router.post("/", (req, res) => {
    const { db } = getDb();
    const card = req.body?.card ?? req.body;
    const id = card?.id || nanoid();
    const now = Date.now();
    const existing = db.prepare("SELECT createdAt FROM cards WHERE id = ?").get(id) as any;
    const createdAt = existing?.createdAt ?? now;
    const name = card?.name ?? "Untitled Card";
    const type = card?.type ?? "UNKNOWN";
    const faction = card?.faction ?? null;
    const schemaVersion = card?.schemaVersion ?? null;
    db.prepare(
      `INSERT OR REPLACE INTO cards (id, name, type, faction, schemaVersion, json, createdAt, updatedAt)
       VALUES (@id, @name, @type, @faction, @schemaVersion, @json, @createdAt, @updatedAt)`
    ).run({
      id,
      name,
      type,
      faction,
      schemaVersion,
      json: JSON.stringify(card ?? {}),
      createdAt,
      updatedAt: now
    });
    res.json({ id, createdAt, updatedAt: now });
  });

  router.put("/:id", (req, res) => {
    const { db } = getDb();
    const card = req.body?.card ?? req.body;
    const id = req.params.id;
    const existing = db.prepare("SELECT createdAt FROM cards WHERE id = ?").get(id) as any;
    const now = Date.now();
    const createdAt = existing?.createdAt ?? now;
    const name = card?.name ?? "Untitled Card";
    const type = card?.type ?? "UNKNOWN";
    const faction = card?.faction ?? null;
    const schemaVersion = card?.schemaVersion ?? null;
    db.prepare(
      `INSERT OR REPLACE INTO cards (id, name, type, faction, schemaVersion, json, createdAt, updatedAt)
       VALUES (@id, @name, @type, @faction, @schemaVersion, @json, @createdAt, @updatedAt)`
    ).run({
      id,
      name,
      type,
      faction,
      schemaVersion,
      json: JSON.stringify(card ?? {}),
      createdAt,
      updatedAt: now
    });
    res.json({ id, createdAt, updatedAt: now });
  });

  router.delete("/:id", (req, res) => {
    const { db } = getDb();
    db.prepare("DELETE FROM cards WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}
