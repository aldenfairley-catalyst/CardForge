import { Router } from "express";
import { nanoid } from "nanoid";
import type { DbContext } from "../db";

export function createScenarioRouter(getDb: () => DbContext) {
  const router = Router();

  router.get("/", (req, res) => {
    const { db } = getDb();
    const search = String(req.query.search ?? "").trim().toLowerCase();
    const clauses: string[] = [];
    const params: any[] = [];
    if (search) {
      clauses.push("(LOWER(name) LIKE ? OR LOWER(json) LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const stmt = db.prepare(
      `SELECT id, name, schemaVersion, createdAt, updatedAt FROM scenarios ${where} ORDER BY updatedAt DESC`
    );
    res.json({ scenarios: stmt.all(...params) });
  });

  router.get("/:id", (req, res) => {
    const { db } = getDb();
    const row = db.prepare("SELECT * FROM scenarios WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Scenario not found" });
    const json = typeof row.json === "string" ? JSON.parse(row.json) : row.json;
    res.json({ ...row, json });
  });

  router.post("/", (req, res) => {
    const { db } = getDb();
    const scenario = req.body?.scenario ?? req.body;
    const id = scenario?.id || nanoid();
    const now = Date.now();
    const existing = db.prepare("SELECT createdAt FROM scenarios WHERE id = ?").get(id) as any;
    const createdAt = existing?.createdAt ?? now;
    const name = scenario?.name ?? "Untitled Scenario";
    const schemaVersion = scenario?.schemaVersion ?? null;
    db.prepare(
      `INSERT OR REPLACE INTO scenarios (id, name, schemaVersion, json, createdAt, updatedAt)
       VALUES (@id, @name, @schemaVersion, @json, @createdAt, @updatedAt)`
    ).run({
      id,
      name,
      schemaVersion,
      json: JSON.stringify(scenario ?? {}),
      createdAt,
      updatedAt: now
    });
    res.json({ id, createdAt, updatedAt: now });
  });

  router.put("/:id", (req, res) => {
    const { db } = getDb();
    const scenario = req.body?.scenario ?? req.body;
    const id = req.params.id;
    const now = Date.now();
    const existing = db.prepare("SELECT createdAt FROM scenarios WHERE id = ?").get(id) as any;
    const createdAt = existing?.createdAt ?? now;
    const name = scenario?.name ?? "Untitled Scenario";
    const schemaVersion = scenario?.schemaVersion ?? null;
    db.prepare(
      `INSERT OR REPLACE INTO scenarios (id, name, schemaVersion, json, createdAt, updatedAt)
       VALUES (@id, @name, @schemaVersion, @json, @createdAt, @updatedAt)`
    ).run({
      id,
      name,
      schemaVersion,
      json: JSON.stringify(scenario ?? {}),
      createdAt,
      updatedAt: now
    });
    res.json({ id, createdAt, updatedAt: now });
  });

  router.delete("/:id", (req, res) => {
    const { db } = getDb();
    db.prepare("DELETE FROM scenarios WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  });

  return router;
}
