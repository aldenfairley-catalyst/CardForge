import type Database from "better-sqlite3";

export function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      faction TEXT NULL,
      schemaVersion TEXT,
      json TEXT,
      createdAt INTEGER,
      updatedAt INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
    CREATE INDEX IF NOT EXISTS idx_cards_type ON cards(type);
    CREATE INDEX IF NOT EXISTS idx_cards_faction ON cards(faction);

    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      name TEXT,
      faction TEXT NULL,
      schemaVersion TEXT,
      json TEXT,
      createdAt INTEGER,
      updatedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS scenarios (
      id TEXT PRIMARY KEY,
      name TEXT,
      schemaVersion TEXT,
      json TEXT,
      createdAt INTEGER,
      updatedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      mime TEXT,
      ext TEXT,
      sha256 TEXT,
      byteSize INTEGER,
      path TEXT,
      createdAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS catalogs (
      namespace TEXT,
      key TEXT,
      json TEXT,
      PRIMARY KEY(namespace, key)
    );

    CREATE TABLE IF NOT EXISTS action_library (
      id TEXT PRIMARY KEY,
      kind TEXT,
      name TEXT,
      json TEXT,
      createdAt INTEGER,
      updatedAt INTEGER
    );
  `);

  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("dbVersion", "CJ-PROJECT-DB-1.0");
  db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)").run("createdAt", String(Date.now()));
}
