import React, { useMemo, useState } from "react";
import type { CardEntity } from "../../lib/types";
import { loadLibrary } from "../../lib/libraryStore";
import { DeckDefinition, makeDefaultDeck } from "../../lib/deckTypes";
import { importDecksJson, loadDeckStore, removeDeck, upsertDeck } from "../../lib/deckStore";

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function cardLabel(c: CardEntity) {
  return `${c.name} • ${c.faction ?? "—"} • ${c.type}`;
}

export function DeckBuilder() {
  const [store, setStore] = useState(() => loadDeckStore());
  const [activeId, setActiveId] = useState<string>(() => store.decks[0]?.id ?? "");
  const [importText, setImportText] = useState("");
  const [importErr, setImportErr] = useState<string | null>(null);

  const lib = loadLibrary();
  const cards = lib.cards;

  const activeDeck: DeckDefinition | null = store.decks.find((d) => d.id === activeId) ?? null;

  function refresh() {
    setStore(loadDeckStore());
  }

  function setDeck(patch: Partial<DeckDefinition>) {
    if (!activeDeck) return;
    const next = { ...activeDeck, ...patch };
    upsertDeck(next);
    refresh();
    setActiveId(next.id);
  }

  function newDeck() {
    const d = makeDefaultDeck();
    upsertDeck(d);
    refresh();
    setActiveId(d.id);
  }

  function deleteDeck() {
    if (!activeDeck) return;
    removeDeck(activeDeck.id);
    const nextStore = loadDeckStore();
    setStore(nextStore);
    setActiveId(nextStore.decks[0]?.id ?? "");
  }

  // Search/filters
  const [q, setQ] = useState("");
  const [factionFilter, setFactionFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");

  const factions = useMemo(() => {
    const s = new Set<string>();
    for (const c of cards) if (c.faction) s.add(c.faction);
    return Array.from(s).sort();
  }, [cards]);

  const types = useMemo(() => {
    const s = new Set<string>();
    for (const c of cards) if (c.type) s.add(c.type);
    return Array.from(s).sort();
  }, [cards]);

  const filteredCards = useMemo(() => {
    const query = q.trim().toLowerCase();
    return cards
      .filter((c) => (factionFilter ? (c.faction ?? "") === factionFilter : true))
      .filter((c) => (typeFilter ? c.type === typeFilter : true))
      .filter((c) => {
        if (!query) return true;
        const hay = `${c.name} ${c.id} ${c.faction ?? ""} ${c.type} ${(c.subType ?? []).join(" ")} ${(c.tags ?? []).join(" ")}`.toLowerCase();
        return hay.includes(query);
      })
      .sort((a, b) => (a.faction ?? "").localeCompare(b.faction ?? "") || a.name.localeCompare(b.name));
  }, [cards, q, factionFilter, typeFilter]);

  const decksByFaction = useMemo(() => {
    const m = new Map<string, DeckDefinition[]>();
    for (const d of store.decks) {
      const key = d.faction?.trim() || "Unassigned";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(d);
    }
    for (const [k, arr] of m.entries()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [store.decks]);

  function addCardToDeck(cardId: string) {
    if (!activeDeck) return;
    const list = activeDeck.cards.slice();
    const idx = list.findIndex((x) => x.cardId === cardId);
    if (idx >= 0) list[idx] = { ...list[idx], qty: list[idx].qty + 1 };
    else list.push({ cardId, qty: 1 });
    setDeck({ cards: list });
  }

  function decCard(cardId: string) {
    if (!activeDeck) return;
    const list = activeDeck.cards.slice();
    const idx = list.findIndex((x) => x.cardId === cardId);
    if (idx < 0) return;
    const qty = list[idx].qty - 1;
    if (qty <= 0) list.splice(idx, 1);
    else list[idx] = { ...list[idx], qty };
    setDeck({ cards: list });
  }

  function findCard(cardId: string) {
    return cards.find((c) => c.id === cardId);
  }

  // drag & drop
  function onDragStartCard(e: any, cardId: string) {
    e.dataTransfer.setData("text/cj-card-id", cardId);
    e.dataTransfer.effectAllowed = "copy";
  }
  function onDropToDeck(e: any) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/cj-card-id");
    if (id) addCardToDeck(id);
  }
  function onDragOverDeck(e: any) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  // “search which decks have a specific card”
  const [inspectCardId, setInspectCardId] = useState<string>("");
  const decksContaining = useMemo(() => {
    if (!inspectCardId) return [];
    return store.decks.filter((d) => d.cards.some((x) => x.cardId === inspectCardId));
  }, [store.decks, inspectCardId]);

  function exportActive() {
    if (!activeDeck) return;
    download(`${activeDeck.name.replace(/\s+/g, "_").toLowerCase()}_deck.json`, JSON.stringify(activeDeck, null, 2));
  }
  function exportAll() {
    download(`cj_decks.json`, JSON.stringify({ decks: store.decks }, null, 2));
  }

  function doImport() {
    setImportErr(null);
    try {
      const incoming = importDecksJson(importText);
      for (const d of incoming) upsertDeck(d);
      setImportText("");
      refresh();
      if (!activeId && incoming[0]) setActiveId(incoming[0].id);
    } catch (e: any) {
      setImportErr(e.message ?? String(e));
    }
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "320px 1fr 360px", minHeight: 0 }}>
      {/* Left */}
      <div className="panel" style={{ minHeight: 0 }}>
        <div className="ph">
          <div>
            <div className="h2">Decks</div>
            <div className="small">Grouped by faction</div>
          </div>
          <span className="badge">{store.decks.length}</span>
        </div>
        <div className="pb" style={{ minHeight: 0, overflow: "auto" }}>
          <button className="btn btnPrimary" style={{ width: "100%", marginBottom: 10 }} onClick={newDeck}>
            + New Deck
          </button>

          {decksByFaction.map(([f, arr]) => (
            <details key={f} open style={{ marginBottom: 10 }}>
              <summary className="small" style={{ cursor: "pointer" }}>
                <b>{f}</b> <span className="badge">{arr.length}</span>
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {arr.map((d) => (
                  <div
                    key={d.id}
                    className="item"
                    style={{ border: d.id === activeId ? "1px solid var(--accent)" : "1px solid var(--border)" }}
                    onClick={() => setActiveId(d.id)}
                    title={d.id}
                  >
                    <b>{d.name}</b>
                    <div className="small">{(d.cards ?? []).reduce((a, x) => a + x.qty, 0)} cards</div>
                  </div>
                ))}
              </div>
            </details>
          ))}

          <hr style={{ borderColor: "var(--border)", opacity: 0.5, margin: "12px 0" }} />

          <div className="small">Import Deck JSON</div>
          {importErr ? (
            <div className="err">
              <b>Import error</b>
              <div className="small">{importErr}</div>
            </div>
          ) : null}
          <textarea className="textarea" style={{ minHeight: 140 }} value={importText} onChange={(e) => setImportText(e.target.value)} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btnPrimary" onClick={doImport} style={{ flex: 1 }}>
              Import
            </button>
            <button className="btn" onClick={exportAll} style={{ flex: 1 }}>
              Export All
            </button>
          </div>
        </div>
      </div>

      {/* Middle */}
      <div className="panel" style={{ minHeight: 0 }}>
        <div className="ph">
          <div>
            <div className="h2">Deck Editor</div>
            <div className="small">{activeDeck ? activeDeck.id : "No deck selected"}</div>
          </div>
          {activeDeck ? <span className="badge">{activeDeck.cards.reduce((a, x) => a + x.qty, 0)} cards</span> : null}
        </div>

        <div className="pb" style={{ minHeight: 0, overflow: "auto" }} onDrop={onDropToDeck} onDragOver={onDragOverDeck}>
          {!activeDeck ? (
            <div className="small">Create or select a deck to edit.</div>
          ) : (
            <>
              <div className="small">Name</div>
              <input className="input" value={activeDeck.name} onChange={(e) => setDeck({ name: e.target.value })} />

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <div className="small">Faction</div>
                  <input className="input" value={activeDeck.faction ?? ""} onChange={(e) => setDeck({ faction: e.target.value })} placeholder="Crimson Doom..." />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="small">Tags (comma)</div>
                  <input
                    className="input"
                    value={(activeDeck.tags ?? []).join(", ")}
                    onChange={(e) => setDeck({ tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                    placeholder="starter, tutorial..."
                  />
                </div>
              </div>

              <div className="small" style={{ marginTop: 8 }}>
                Notes
              </div>
              <textarea className="textarea" value={activeDeck.notes ?? ""} onChange={(e) => setDeck({ notes: e.target.value })} />

              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button className="btn" onClick={exportActive}>
                  Export Deck
                </button>
                <button className="btn btnDanger" onClick={deleteDeck}>
                  Delete Deck
                </button>
              </div>

              <hr style={{ borderColor: "var(--border)", opacity: 0.5, margin: "12px 0" }} />

              <div className="small">Cards (drag from right panel)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {activeDeck.cards.length === 0 ? (
                  <div className="small">Drop cards here to add them.</div>
                ) : (
                  activeDeck.cards.map((entry) => {
                    const c = findCard(entry.cardId);
                    return (
                      <div key={entry.cardId} className="item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <b style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {c ? c.name : entry.cardId}
                          </b>
                          <div className="small">{c ? `${c.faction ?? "—"} • ${c.type}` : "Unknown card (not in library)"}</div>
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <button className="btn" onClick={() => decCard(entry.cardId)}>
                            -
                          </button>
                          <span style={{ fontWeight: 800, width: 24, textAlign: "center" }}>{entry.qty}</span>
                          <button className="btn" onClick={() => addCardToDeck(entry.cardId)}>
                            +{/* plus */}
                          </button>
                          <button className="btn" onClick={() => setInspectCardId(entry.cardId)} title="Find decks containing this card">
                            🔎
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {inspectCardId ? (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <div className="small">
                    <b>Decks containing:</b> {inspectCardId}
                  </div>
                  {decksContaining.length ? (
                    <ul className="small">
                      {decksContaining.map((d) => (
                        <li key={d.id} style={{ cursor: "pointer" }} onClick={() => setActiveId(d.id)}>
                          {d.name} ({d.faction ?? "—"})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="small">None</div>
                  )}
                  <button className="btn" onClick={() => setInspectCardId("")}>
                    Close
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* Right */}
      <div className="panel" style={{ minHeight: 0 }}>
        <div className="ph">
          <div>
            <div className="h2">Card Picker</div>
            <div className="small">Search + filters • drag into deck</div>
          </div>
          <span className="badge">{filteredCards.length}</span>
        </div>
        <div className="pb" style={{ minHeight: 0, overflow: "auto" }}>
          <div className="small">Search</div>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, tag, type..." />

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <div className="small">Faction</div>
              <select className="select" value={factionFilter} onChange={(e) => setFactionFilter(e.target.value)}>
                <option value="">All</option>
                {factions.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div className="small">Type</div>
              <select className="select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">All</option>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {filteredCards.map((c) => (
              <div
                key={c.id}
                className="item"
                draggable
                onDragStart={(e) => onDragStartCard(e, c.id)}
                onDoubleClick={() => addCardToDeck(c.id)}
                title="Drag into deck (or double click)"
                style={{ display: "flex", gap: 10, alignItems: "center" }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", flex: "0 0 auto" }}>
                  {c.visuals?.cardImage ? <img src={c.visuals.cardImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                </div>
                <div style={{ minWidth: 0 }}>
                  <b style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</b>
                  <div className="small">{cardLabel(c)}</div>
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button className="btn" onClick={() => addCardToDeck(c.id)}>
                    +1
                  </button>
                  <button className="btn" onClick={() => setInspectCardId(c.id)} title="Find decks containing this card">
                    🔎
                  </button>
                </div>
              </div>
            ))}
            {filteredCards.length === 0 ? <div className="small">No matches.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
