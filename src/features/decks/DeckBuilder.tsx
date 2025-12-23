import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { CardEntity } from "../../lib/types";
import type { DataProvider, DeckSummary } from "../../lib/dataProvider";
import { DeckDefinition, makeDefaultDeck } from "../../lib/deckTypes";
import { importDecksJson } from "../../lib/deckStore";

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

export function DeckBuilder({ provider }: { provider: DataProvider }) {
  const [cards, setCards] = useState<CardEntity[]>([]);
  const [deckSummaries, setDeckSummaries] = useState<DeckSummary[]>([]);
  const [deckDetails, setDeckDetails] = useState<Record<string, DeckDefinition>>({});
  const [activeId, setActiveId] = useState<string>("");
  const [activeDeck, setActiveDeck] = useState<DeckDefinition | null>(null);
  const [importText, setImportText] = useState("");
  const [importErr, setImportErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [factionFilter, setFactionFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");

  const refresh = useCallback(
    async (desiredActiveId?: string) => {
      setLoading(true);
      setErr(null);
      try {
        const [cardList, decks] = await Promise.all([provider.cards.list(), provider.decks.list()]);
        setCards(cardList as CardEntity[]);
        setDeckSummaries(decks);
        const detailPairs = await Promise.all(
          decks.map(async (d) => {
            const full = await provider.decks.get(d.id);
            return full ? ([d.id, full] as const) : null;
          })
        );
        const detailMap: Record<string, DeckDefinition> = {};
        detailPairs.forEach((pair) => {
          if (pair) detailMap[pair[0]] = pair[1];
        });
        setDeckDetails(detailMap);

        const nextActiveId =
          (desiredActiveId && decks.some((d) => d.id === desiredActiveId) && desiredActiveId) || decks[0]?.id || "";
        setActiveId(nextActiveId);
        const selected = nextActiveId ? detailMap[nextActiveId] ?? null : null;
        setActiveDeck(selected);
      } catch (e: any) {
        setErr(e?.message ?? String(e));
        setActiveDeck(null);
      } finally {
        setLoading(false);
      }
    },
    [provider]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
    const m = new Map<string, DeckSummary[]>();
    for (const d of deckSummaries) {
      const key = d.faction?.trim() || "Unassigned";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(d);
    }
    for (const [k, arr] of m.entries()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [deckSummaries]);

  async function selectDeck(id: string) {
    setActiveId(id);
    const next = deckDetails[id] ?? (await provider.decks.get(id));
    if (next) {
      setDeckDetails((prev) => ({ ...prev, [id]: next }));
      setActiveDeck(next);
    } else {
      setActiveDeck(null);
    }
  }

  async function setDeck(patch: Partial<DeckDefinition>) {
    if (!activeDeck) return;
    const next = { ...activeDeck, ...patch };
    await provider.decks.upsert(next);
    setActiveDeck(next);
    setDeckDetails((prev) => ({ ...prev, [next.id]: next }));
    await refresh(next.id);
  }

  async function newDeck() {
    const d = makeDefaultDeck();
    await provider.decks.upsert(d);
    await refresh(d.id);
  }

  async function deleteDeck() {
    if (!activeDeck) return;
    await provider.decks.remove(activeDeck.id);
    setActiveDeck(null);
    await refresh();
  }

  function addCardToDeck(cardId: string) {
    if (!activeDeck) return;
    const list = activeDeck.cards.slice();
    const idx = list.findIndex((x) => x.cardId === cardId);
    if (idx >= 0) list[idx] = { ...list[idx], qty: list[idx].qty + 1 };
    else list.push({ cardId, qty: 1 });
    void setDeck({ cards: list });
  }

  function decCard(cardId: string) {
    if (!activeDeck) return;
    const list = activeDeck.cards.slice();
    const idx = list.findIndex((x) => x.cardId === cardId);
    if (idx < 0) return;
    const qty = list[idx].qty - 1;
    if (qty <= 0) list.splice(idx, 1);
    else list[idx] = { ...list[idx], qty };
    void setDeck({ cards: list });
  }

  function findCard(cardId: string) {
    return cards.find((c) => c.id === cardId);
  }

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

  const [inspectCardId, setInspectCardId] = useState<string>("");
  const decksContaining = useMemo(() => {
    if (!inspectCardId) return [];
    return Object.values(deckDetails).filter((d) => d.cards?.some((x) => x.cardId === inspectCardId));
  }, [deckDetails, inspectCardId]);

  async function exportActive() {
    if (!activeDeck) return;
    download(`${activeDeck.name.replace(/\s+/g, "_").toLowerCase()}_deck.json`, JSON.stringify(activeDeck, null, 2));
  }
  async function exportAll() {
    const fullDecks = deckSummaries.map((d) => deckDetails[d.id]).filter(Boolean);
    download(`cj_decks.json`, JSON.stringify({ decks: fullDecks }, null, 2));
  }

  async function doImport() {
    setImportErr(null);
    try {
      const incoming = importDecksJson(importText);
      for (const d of incoming) await provider.decks.upsert(d);
      setImportText("");
      await refresh(incoming[0]?.id);
    } catch (e: any) {
      setImportErr(e.message ?? String(e));
    }
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: "320px 1fr 360px", minHeight: 0 }}>
      <div className="panel" style={{ minHeight: 0 }}>
        <div className="ph">
          <div>
            <div className="h2">Decks</div>
            <div className="small">Grouped by faction</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="badge">{deckSummaries.length}</span>
            {loading ? <span className="small">Loading…</span> : null}
          </div>
        </div>
        <div className="pb" style={{ minHeight: 0, overflow: "auto" }}>
          <button className="btn btnPrimary" style={{ width: "100%", marginBottom: 10 }} onClick={newDeck}>
            + New Deck
          </button>

          {err ? (
            <div className="err">
              <b>Load error</b>
              <div className="small">{err}</div>
            </div>
          ) : null}

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
                    onClick={() => void selectDeck(d.id)}
                    title={d.id}
                  >
                    <b>{d.name}</b>
                    <div className="small">
                      {(deckDetails[d.id]?.cards ?? []).reduce((a, x) => a + x.qty, 0)} cards
                    </div>
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
            <button className="btn btnPrimary" onClick={() => void doImport()} style={{ flex: 1 }} disabled={!importText.trim()}>
              Import
            </button>
            <button className="btn" onClick={() => void exportAll()} style={{ flex: 1 }}>
              Export All
            </button>
          </div>
        </div>
      </div>

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
              <input className="input" value={activeDeck.name} onChange={(e) => void setDeck({ name: e.target.value })} />

              <div className="small" style={{ marginTop: 8 }}>
                Faction
              </div>
              <input className="input" value={activeDeck.faction ?? ""} onChange={(e) => void setDeck({ faction: e.target.value })} placeholder="FACTION_NAME" />

              <div className="small" style={{ marginTop: 8 }}>
                Description
              </div>
              <textarea className="textarea" value={activeDeck.description ?? ""} onChange={(e) => void setDeck({ description: e.target.value })} />

              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <div className="small" style={{ flex: 1 }}>
                  Cards <span className="badge">{activeDeck.cards.length}</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn" onClick={() => void exportActive()}>
                    Export
                  </button>
                  <button className="btn btnDanger" onClick={() => void deleteDeck()}>
                    Delete
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                {activeDeck.cards.map((entry, idx) => {
                  const card = findCard(entry.cardId);
                  return (
                    <div key={entry.cardId} className="item" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 240px" }}>
                        <b>{card ? cardLabel(card) : entry.cardId}</b>
                        <div className="small">Qty: {entry.qty}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button className="btn" onClick={() => addCardToDeck(entry.cardId)}>
                          +
                        </button>
                        <button className="btn btnDanger" onClick={() => decCard(entry.cardId)}>
                          -
                        </button>
                      </div>
                    </div>
                  );
                })}
                {!activeDeck.cards.length ? <div className="small">Drag cards here to add them to the deck.</div> : null}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="panel" style={{ minHeight: 0 }}>
        <div className="ph">
          <div>
            <div className="h2">Card Library</div>
            <div className="small">Filters apply to the library below</div>
          </div>
          <span className="badge">{cards.length}</span>
        </div>

        <div className="pb" style={{ minHeight: 0, overflow: "auto" }}>
          <div className="small">Search / Filter</div>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, faction, type, tag..." />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <select className="select" value={factionFilter} onChange={(e) => setFactionFilter(e.target.value)} style={{ flex: 1 }}>
              <option value="">All factions</option>
              {factions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <select className="select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ flex: 1 }}>
              <option value="">All types</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="small" style={{ marginTop: 8 }}>
            Add to deck
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            {filteredCards.map((c) => (
              <div
                key={c.id}
                className="item"
                draggable
                onDragStart={(e) => onDragStartCard(e, c.id)}
                style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}
              >
                <div>
                  <b>{cardLabel(c)}</b>
                  <div className="small">{c.id}</div>
                </div>
                <button className="btn btnPrimary" onClick={() => addCardToDeck(c.id)}>
                  + Add
                </button>
              </div>
            ))}
            {!filteredCards.length ? <div className="small">No cards match the current filters.</div> : null}
          </div>

          <hr style={{ borderColor: "var(--border)", opacity: 0.5, margin: "12px 0" }} />

          <div className="small">Inspect decks using this card</div>
          <select className="select" value={inspectCardId} onChange={(e) => setInspectCardId(e.target.value)} style={{ marginTop: 6 }}>
            <option value="">(select a card)</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {cardLabel(c)}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            {decksContaining.map((d) => (
              <div key={d.id} className="small">
                {d.name} ({d.id})
              </div>
            ))}
            {!decksContaining.length && inspectCardId ? <div className="small">No decks include this card yet.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
