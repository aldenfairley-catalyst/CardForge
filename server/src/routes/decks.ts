import { Router } from "express";
import { nanoid } from "nanoid";
import type { DbContext } from "../db";

export function createDeckRouter(getDb: () => DbContext) {
  const router = Router();

  router.get("/", (req, res) => {
    const { db } = getDb();
    const search = String(req.query.search ?? "").trim().toLowerCase();
    const faction = String(req.query.faction ?? "").trim();
    const clauses: string[] = [];
    const params: any[] = [];

    if (search) {
      clauses.push("(LOWER(name) LIKE ? OR LOWER(json) LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    if (faction) {
      clauses.push("faction = ?");
      params.push(faction);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const stmt = db.prepare(
      `SELECT id, name, faction, schemaVersion, createdAt, updatedAt FROM decks ${where} ORDER BY updatedAt DESC`
    );
    res.json({ decks: stmt.all(...params) });
  });

  router.get("/:id", (req, res) => {
    const { db } = getDb();
    const row = db.prepare("SELECT * FROM decks WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Deck not found" });
    const json = typeof row.json === "string" ? JSON.parse(row.json) : row.json;
    res.json({ ...row, json });
  });

  router.post("/", (req, res) => {
    const { db } = getDb();
    const deck = req.body?.deck ?? req.body;
    const id = deck?.id || nanoid();
    const now = Date.now();
    const existing = db.prepare("SELECT createdAt FROM decks WHERE id = ?").get(id) as any;
    const createdAt = existing?.createdAt ?? now;
    const name = deck?.name ?? "Untitled Deck";
    const faction = deck?.faction ?? null;
    const schemaVersion = deck?.schemaVersion ?? null;
    db.prepare(
      `INSERT OR REPLACE INTO decks (id, name, faction, schemaVersion, json, createdAt, updatedAt)
       VALUES (@id, @name, @faction, @schemaVersion, @json, @createdAt, @updatedAt)`
    ).run({
      id,
      name,
      faction,
      schemaVersion,
      json: JSON.stringify(deck ?? {}),
      createdAt,
      updatedAt: now
    });
    res.json({ id, createdAt, updatedAt: now });
  });

  router.put("/:id", (req, res) => {
    const { db } = getDb();
    const deck = req.body?.deck ?? req.body;
    const id = req.params.id;
    const now = Date.now();
    const existing = db.prepare("SELECT createdAt FROM decks WHERE id = ?").get(id) as any;
    const createdAt = existing?.createdAt ?? now;
    const name = deck?.name ?? "Untitled Deck";
    const faction = deck?.faction ?? null;
    const schemaVersion = deck?.schemaVersion ?? null;
    db.prepare(
      `INSERT OR REPLACE INTO decks (id, name, faction, schemaVersion, json, createdAt, updatedAt)
       VALUES (@id, @name, @faction, @schemaVersion, @json, @createdAt, @updatedAt)`
    ).run({
      id,
      name,
      faction,
      schemaVersion,
      json: JSON.stringify(deck ?? {}),
      createdAt,
      updatedAt: now
    });
    res.json({ id, createdAt, updatedAt: now });
  });

  router.delete("/:id", (req, res) => {
    const { db } = getDb();
    db.prepare("DELETE FROM decks WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  });

  router.post("/:id/validate", (req, res) => {
    // Placeholder for server-side validation hooks
    res.json({ issues: [] });
  });

  return router;
}
