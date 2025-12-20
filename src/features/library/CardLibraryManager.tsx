import React, { useMemo, useState } from "react";
import type { CardEntity } from "../../lib/types";
import {
  importLibraryJson,
  loadLibrary,
  removeCardFromLibrary,
  saveLibrary,
  upsertCardInLibrary
} from "../../lib/libraryStore";

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CardLibraryManager(props: { currentCard?: CardEntity }) {
  const [lib, setLib] = useState(() => loadLibrary());
  const [importText, setImportText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const cards = useMemo(() => {
    const query = q.trim().toLowerCase();
    const out = lib.cards.slice();
    out.sort((a, b) => (a.faction ?? "").localeCompare(b.faction ?? "") || a.name.localeCompare(b.name));
    if (!query) return out;
    return out.filter((c) => {
      const hay = `${c.name} ${c.id} ${(c.faction ?? "")} ${(c.type ?? "")} ${(c.subType ?? []).join(" ")} ${(c.tags ?? []).join(" ")}`.toLowerCase();
      return hay.includes(query);
    });
  }, [lib.cards, q]);

  function refresh() {
    setLib(loadLibrary());
  }

  function addCurrent() {
    if (!props.currentCard) return;
    upsertCardInLibrary(props.currentCard);
    refresh();
  }

  function exportAll() {
    download("cj_library.json", JSON.stringify({ schemaVersion: "CJ-LIB-1.0", cards: lib.cards }, null, 2));
  }

  function doImport() {
    setErr(null);
    try {
      const imported = importLibraryJson(importText);
      saveLibrary(imported);
      setImportText("");
      refresh();
    } catch (e: any) {
      setErr(e.message ?? String(e));
    }
  }

  return (
    <div className="panel" style={{ minHeight: 0 }}>
      <div className="ph">
        <div>
          <div className="h2">Card Library</div>
          <div className="small">Local catalog of cards for deck/scenario building</div>
        </div>
        <span className="badge">{lib.cards.length} cards</span>
      </div>

      <div className="pb" style={{ display: "flex", gap: 12, flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btnPrimary" onClick={addCurrent} disabled={!props.currentCard}>
            + Add Current Card
          </button>
          <button className="btn" onClick={exportAll}>
            Export Library
          </button>
          <button
            className="btn"
            onClick={() => {
              saveLibrary({ schemaVersion: "CJ-LIB-1.0", cards: [] });
              refresh();
            }}
          >
            Clear
          </button>
        </div>

        <div className="small">Search</div>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, faction, type, tag..." />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, minHeight: 0 }}>
          <div style={{ minHeight: 0, overflow: "auto", border: "1px solid var(--border)", borderRadius: 12, padding: 10 }}>
            {cards.map((c) => (
              <div key={c.id} className="item" style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <div>
                  <b>{c.name}</b>
                  <div className="small">
                    {c.faction ?? "—"} • {c.type} • {c.id}
                  </div>
                </div>
                <button
                  className="btn btnDanger"
                  onClick={() => {
                    removeCardFromLibrary(c.id);
                    refresh();
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            {!cards.length ? <div className="small">No cards in library yet. Add the current card or import a bundle.</div> : null}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 0 }}>
            <div className="small">Import Library JSON</div>
            {err ? (
              <div className="err">
                <b>Import error</b>
                <div className="small">{err}</div>
              </div>
            ) : null}
            <textarea className="textarea" style={{ minHeight: 200 }} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="{ cards: [...] } or [ ... ]" />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btnPrimary" onClick={doImport}>
                Import
              </button>
            </div>
          </div>
        </div>

        <div className="small" style={{ opacity: 0.9 }}>
          Tip: Prefer using <code>/public/cards/</code> images and storing URLs in <code>visuals.cardImage</code>.
        </div>
      </div>
    </div>
  );
}
