import React, { useMemo, useState } from "react";
import type { ToolCatalog, ToolDefinition } from "../../lib/types";
import { exportToolCatalog, importToolCatalog, removeTool, upsertTool } from "../../lib/toolStore";

type Props = {
  catalog: ToolCatalog;
  onChange: (next: ToolCatalog) => void;
};

const blankTool = (): ToolDefinition => ({
  id: "tool_" + Math.random().toString(36).slice(2, 6),
  name: "New Tool",
  version: "1.0.0",
  kind: "JS_SNIPPET",
  runtime: "CLIENT",
  description: "",
  inputSchema: { type: "object", properties: {}, required: [] },
  outputSchema: { type: "object", properties: {}, required: [] },
  code: "// ctx available\nreturn { ok: true };"
});

export function ToolManager({ catalog, onChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(catalog.tools[0]?.id ?? null);
  const [importText, setImportText] = useState("");
  const selected = useMemo(() => catalog.tools.find((t) => t.id === selectedId) ?? null, [catalog.tools, selectedId]);

  function updateSelected(changes: Partial<ToolDefinition>) {
    if (!selected) return;
    const next = { ...selected, ...changes };
    onChange(upsertTool(catalog, next));
  }

  function addTool() {
    const next = blankTool();
    onChange(upsertTool(catalog, next));
    setSelectedId(next.id);
  }

  function deleteTool(id: string) {
    onChange(removeTool(catalog, id));
    if (selectedId === id) setSelectedId(catalog.tools.find((t) => t.id !== id)?.id ?? null);
  }

  function handleImport() {
    try {
      const parsed = importToolCatalog(importText);
      onChange(parsed);
      setSelectedId(parsed.tools[0]?.id ?? null);
      setImportText("");
    } catch (e: any) {
      alert(e?.message ?? String(e));
    }
  }

  const exportJson = exportToolCatalog(catalog);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 12, minHeight: 320 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btnPrimary" onClick={addTool}>
            + Add Tool
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, overflow: "auto" }}>
          {catalog.tools.map((tool) => (
            <div
              key={tool.id}
              className="item"
              style={{ borderColor: selectedId === tool.id ? "var(--accent)" : undefined }}
              onClick={() => setSelectedId(tool.id)}
            >
              <div className="small" style={{ fontWeight: 700 }}>
                {tool.name}
              </div>
              <div className="small">{tool.id}</div>
              <div className="small">
                {tool.kind} • {tool.runtime}
              </div>
              <button className="btn btnDanger" style={{ marginTop: 6 }} onClick={(e) => (e.stopPropagation(), deleteTool(tool.id))}>
                Delete
              </button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="small">Import catalog (CJ-TOOLS-1.0)</div>
          <textarea className="textarea" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste JSON here" />
          <button className="btn" onClick={handleImport}>
            Import
          </button>
          <div className="small">Export catalog JSON</div>
          <textarea className="textarea" value={exportJson} readOnly />
        </div>
      </div>

      {selected ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <div className="small">Tool Id</div>
              <input className="input" value={selected.id} onChange={(e) => updateSelected({ id: e.target.value })} />
            </div>
            <div>
              <div className="small">Name</div>
              <input className="input" value={selected.name} onChange={(e) => updateSelected({ name: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div className="small">Version</div>
                <input className="input" value={selected.version} onChange={(e) => updateSelected({ version: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="small">Kind</div>
                <select className="select" value={selected.kind} onChange={(e) => updateSelected({ kind: e.target.value as ToolDefinition["kind"] })}>
                  <option value="JS_SNIPPET">JS Snippet</option>
                  <option value="WEBHOOK">Webhook</option>
                  <option value="UI_FLOW">UI Flow</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div className="small">Runtime</div>
                <select
                  className="select"
                  value={selected.runtime}
                  onChange={(e) => updateSelected({ runtime: e.target.value as ToolDefinition["runtime"] })}
                >
                  <option value="CLIENT">Client</option>
                  <option value="SERVER">Server</option>
                </select>
              </div>
            </div>
            <div>
              <div className="small">Description</div>
              <textarea
                className="textarea"
                value={selected.description ?? ""}
                onChange={(e) => updateSelected({ description: e.target.value })}
              />
            </div>
            <div>
              <div className="small">Input Schema (JSON)</div>
              <textarea
                className="textarea"
                value={JSON.stringify(selected.inputSchema ?? {}, null, 2)}
                onChange={(e) => {
                  try {
                    updateSelected({ inputSchema: JSON.parse(e.target.value) });
                  } catch {
                    /* noop */
                  }
                }}
              />
            </div>
            <div>
              <div className="small">Output Schema (JSON)</div>
              <textarea
                className="textarea"
                value={JSON.stringify(selected.outputSchema ?? {}, null, 2)}
                onChange={(e) => {
                  try {
                    updateSelected({ outputSchema: JSON.parse(e.target.value) });
                  } catch {
                    /* noop */
                  }
                }}
              />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <div className="small">Code / Payload</div>
              <textarea className="textarea" style={{ minHeight: 320 }} value={selected.code ?? ""} onChange={(e) => updateSelected({ code: e.target.value })} />
            </div>
            <div>
              <div className="small">Endpoint (for WEBHOOK)</div>
              <input className="input" value={selected.endpoint ?? ""} onChange={(e) => updateSelected({ endpoint: e.target.value })} />
            </div>
            <div>
              <div className="small">UI Config</div>
              <textarea
                className="textarea"
                value={JSON.stringify(selected.ui ?? {}, null, 2)}
                onChange={(e) => {
                  try {
                    updateSelected({ ui: JSON.parse(e.target.value) });
                  } catch {
                    /* noop */
                  }
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="small">Select a tool to edit.</div>
      )}
    </div>
  );
}
