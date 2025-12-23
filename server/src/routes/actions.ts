import { Router } from "express";
import type { DbContext } from "../db";

export function createActionsRouter(getDb: () => DbContext) {
  const router = Router();

  router.get("/", (req, res) => {
    const { db } = getDb();
    const rows = db.prepare("SELECT id, kind, name, updatedAt FROM action_library ORDER BY updatedAt DESC").all();
    res.json({ actions: rows });
  });

  return router;
}
