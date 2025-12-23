import type { ToolCatalog, ToolDefinition } from "./types";
import { TOOL_STORE_VERSION } from "./versions";

const STORAGE_KEY = "cj_tools";

const defaultTool: ToolDefinition = {
  id: "ui.timer",
  name: "Timer",
  version: "1.0.0",
  kind: "JS_SNIPPET",
  runtime: "CLIENT",
  description: "Waits for N milliseconds asynchronously.",
  inputSchema: {
    type: "object",
    properties: { ms: { type: "integer", minimum: 0, default: 1000 } },
    required: ["ms"]
  },
  outputSchema: {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"]
  },
  code: "await new Promise((resolve) => ctx.browser?.setTimeout(resolve, input.ms)); return { ok: true };"
};

function safeParse(json: string): ToolCatalog | null {
  try {
    const parsed = JSON.parse(json);
    if (parsed && parsed.schemaVersion === TOOL_STORE_VERSION && Array.isArray(parsed.tools)) return parsed as ToolCatalog;
    return null;
  } catch {
    return null;
  }
}

export function loadToolCatalog(): ToolCatalog {
  if (typeof localStorage === "undefined") {
    return { schemaVersion: TOOL_STORE_VERSION, tools: [defaultTool] };
  }
  const cached = localStorage.getItem(STORAGE_KEY);
  const parsed = cached ? safeParse(cached) : null;
  if (parsed) return parsed;
  return { schemaVersion: TOOL_STORE_VERSION, tools: [defaultTool] };
}

export function saveToolCatalog(catalog: ToolCatalog) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      schemaVersion: TOOL_STORE_VERSION,
      tools: catalog.tools ?? []
    })
  );
}

export function upsertTool(catalog: ToolCatalog, tool: ToolDefinition): ToolCatalog {
  const filtered = (catalog.tools ?? []).filter((t) => t.id !== tool.id);
  return { schemaVersion: TOOL_STORE_VERSION, tools: [...filtered, tool] };
}

export function removeTool(catalog: ToolCatalog, toolId: string): ToolCatalog {
  return { schemaVersion: TOOL_STORE_VERSION, tools: (catalog.tools ?? []).filter((t) => t.id !== toolId) };
}

export function importToolCatalog(json: string): ToolCatalog {
  const parsed = safeParse(json);
  if (parsed) return parsed;
  throw new Error(`Invalid tool catalog JSON (expected schemaVersion ${TOOL_STORE_VERSION}).`);
}

export function exportToolCatalog(catalog: ToolCatalog): string {
  return JSON.stringify(catalog, null, 2);
}
