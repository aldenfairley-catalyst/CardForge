import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { DEPRECATED_IMPORT_VERSION_STRINGS } from "../src/lib/versions";

const ROOT = path.resolve(__dirname, "..");
const ALLOWLIST = new Set([
  path.join(ROOT, "src", "lib", "migrations.ts"),
  path.join(ROOT, "src", "lib", "versions.ts")
]);

function shouldSkip(filePath: string): boolean {
  if (ALLOWLIST.has(filePath)) return true;
  const rel = path.relative(ROOT, filePath).replace(/\\/g, "/");
  return (
    rel.startsWith("node_modules/") ||
    rel.startsWith("dist/") ||
    rel.startsWith("docs/archive/") ||
    rel.startsWith("tests/fixtures/") ||
    rel.startsWith("coverage/")
  );
}

function walk(dir: string, results: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, results);
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

describe("deprecation leak gates", () => {
  it("does not leak deprecated schema versions outside allowed locations", () => {
    const files = walk(path.join(ROOT, "src"))
      .concat(walk(path.join(ROOT, "server")))
      .concat(walk(path.join(ROOT, "tests")));
    const leaks: Array<{ file: string; version: string }> = [];

    for (const file of files) {
      if (shouldSkip(file)) continue;
      const text = fs.readFileSync(file, "utf8");
      for (const version of DEPRECATED_IMPORT_VERSION_STRINGS) {
        if (text.includes(version)) {
          leaks.push({ file: path.relative(ROOT, file), version });
        }
      }
    }

    expect(leaks).toEqual([]);
  });
});
