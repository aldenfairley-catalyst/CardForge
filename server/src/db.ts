import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { migrate } from "./migrate";

export type DbContext = {
  db: Database.Database;
  projectPath: string;
  projectDir: string;
  assetsDir: string;
};

let current: DbContext | null = null;

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function defaultProjectPath() {
  const envPath = process.env.PROJECT_PATH;
  if (envPath) return path.resolve(envPath);
  const localDir = path.join(process.cwd(), "local-data");
  ensureDir(localDir);
  return path.join(localDir, "forge.sqlite");
}

export function getDb(): DbContext {
  if (!current) {
    openProject(defaultProjectPath());
  }
  if (!current) throw new Error("Database not initialized");
  return current;
}

export function openProject(dbPath: string): DbContext {
  const resolved = path.resolve(dbPath);
  const projectDir = path.dirname(resolved);
  ensureDir(projectDir);
  const db = new Database(resolved);
  migrate(db);
  const assetsDir = path.join(projectDir, "assets");
  ensureDir(assetsDir);
  current = { db, projectPath: resolved, projectDir, assetsDir };
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("lastOpenedAt", String(Date.now()));
  return current;
}

export function closeCurrent() {
  if (current) current.db.close();
  current = null;
}
