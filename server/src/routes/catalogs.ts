import { Router } from "express";
import type { DbContext } from "../db";

export function createCatalogRouter(getDb: () => DbContext) {
  const router = Router();

  router.get("/:namespace", (req, res) => {
    const { db } = getDb();
    const rows = db.prepare("SELECT key, json FROM catalogs WHERE namespace = ?").all(req.params.namespace);
    const entries = rows.map((r) => ({ key: r.key, value: safeParse(r.json) }));
    res.json({ namespace: req.params.namespace, entries });
  });

  router.put("/:namespace/:key", (req, res) => {
    const { db } = getDb();
    db.prepare("INSERT OR REPLACE INTO catalogs (namespace, key, json) VALUES (?, ?, ?)").run(
      req.params.namespace,
      req.params.key,
      JSON.stringify(req.body?.value ?? req.body)
    );
    res.json({ ok: true });
  });

  router.delete("/:namespace/:key", (req, res) => {
    const { db } = getDb();
    db.prepare("DELETE FROM catalogs WHERE namespace = ? AND key = ?").run(req.params.namespace, req.params.key);
    res.json({ ok: true });
  });

  return router;
}

function safeParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
