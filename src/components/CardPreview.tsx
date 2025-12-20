import React, { useMemo } from "react";
import type { CardEntity } from "../lib/types";

type ResourceKey = "UMB" | "AET" | "CRD" | "CHR" | "STR" | "RES" | "WIS" | "INT" | "SPD" | "AWR";

const RESOURCE_LABELS: Record<ResourceKey, string> = {
  UMB: "Umbra",
  AET: "Aether",
  CRD: "Coordination",
  CHR: "Charisma",
  STR: "Strength",
  RES: "Resilience",
  WIS: "Wisdom",
  INT: "Intelligence",
  SPD: "Speed",
  AWR: "Awareness"
};

const TYPE_HELP: Record<string, string> = {
  UNIT: "A unit placed on the board. Has HP/AP/MOVE/SIZE and can act.",
  ITEM: "An equippable or usable item that modifies units or actions.",
  SPELL: "Played from hand (or cast) to produce an effect.",
  ENVIRONMENT: "Terrain / obstacles / hazards that exist on the board.",
  TOKEN: "A token entity used for economy/statuses/summons."
};

const TRIGGER_HELP: Record<string, string> = {
  ACTIVE_ACTION: "You choose to use this on your turn (costs AP).",
  PASSIVE_AURA: "Always-on passive effect (usually radius/aura).",
  REACTION: "Triggered in a reaction window (interrupt/response).",
  ON_EQUIP: "Triggers when the item is equipped.",
  ON_DRAW: "Triggers when drawn into hand.",
  ON_PLAY: "Triggers when played from hand.",
  ON_DEATH: "Triggers when the entity dies."
};

function inferTemplate(card: any): "T1" | "T2" | "T3" | "T4" | "T5" {
  const preset = card?.presentation?.template;
  if (preset === "T1" || preset === "T2" || preset === "T3" || preset === "T4" || preset === "T5") return preset;
  switch (card?.type) {
    case "UNIT":
      return "T1";
    case "ITEM":
      return "T2";
    case "SPELL":
      return "T3";
    case "ENVIRONMENT":
      return "T4";
    case "TOKEN":
      return "T5";
    default:
      return "T1";
  }
}

function themeClass(card: any): string {
  const t = String(card?.presentation?.theme ?? "BLUE").toLowerCase();
  const allowed = ["blue", "green", "purple", "orange", "red"];
  return allowed.includes(t) ? `theme-${t}` : "theme-blue";
}

function templateClass(tpl: string): string {
  return `tpl-${String(tpl).toLowerCase()}`;
}

function abbreviate(text: string | undefined, max = 3): string {
  if (!text) return "—";
  const cleaned = text.replace(/[^a-z0-9]/gi, "");
  if (!cleaned.length) return "—";
  return cleaned.slice(0, max).toUpperCase();
}

function asNumber(n: any, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function formatTokenCosts(tokens: Record<string, any> | undefined): Array<{ k: string; v: number; label: string }> {
  if (!tokens) return [];
  const out: Array<{ k: string; v: number; label: string }> = [];
  for (const [k, raw] of Object.entries(tokens)) {
    const v = Math.max(0, Math.floor(Number(raw) || 0));
    if (v <= 0) continue;
    const kk = k as ResourceKey;
    const label = (RESOURCE_LABELS as any)[kk] ?? k;
    out.push({ k, v, label });
  }
  // stable order: known resources first
  const order: ResourceKey[] = ["UMB", "AET", "CRD", "CHR", "STR", "RES", "WIS", "INT", "SPD", "AWR"];
  out.sort((a, b) => {
    const ai = order.indexOf(a.k as ResourceKey);
    const bi = order.indexOf(b.k as ResourceKey);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.k.localeCompare(b.k);
  });
  return out;
}

function groupAbilities(abilities: any[]) {
  const groups: Record<string, any[]> = {};
  for (const a of abilities) {
    const trig = String(a?.trigger ?? "UNKNOWN");
    if (!groups[trig]) groups[trig] = [];
    groups[trig].push(a);
  }
  return groups;
}

function sectionTitleForTrigger(trigger: string) {
  switch (trigger) {
    case "ACTIVE_ACTION":
      return "Abilities";
    case "PASSIVE_AURA":
      return "Passive Effects";
    case "REACTION":
      return "Reactions";
    case "ON_EQUIP":
      return "On Equip";
    case "ON_DRAW":
      return "On Draw";
    case "ON_PLAY":
      return "On Play";
    case "ON_DEATH":
      return "On Death";
    default:
      return trigger;
  }
}

export function CardPreview({ card }: { card: CardEntity }) {
  const c: any = card as any;

  const tpl = inferTemplate(c);
  const wrapperClass = `cardPreview ${themeClass(c)} ${templateClass(tpl)}`;

  const imgUrl = String(c?.visuals?.cardImage ?? "");
  const objPos = String(c?.presentation?.imagePosition ?? "center center");

  const faction = String(c?.faction ?? "");
  const primaryType = Array.isArray(c?.subType) && c.subType.length ? String(c.subType[0]) : "";

  const unitHp = asNumber(c?.stats?.hp?.max, 0);
  const unitAp = asNumber(c?.stats?.ap?.max, 0);
  const unitMove = asNumber(c?.stats?.movement, 0);
  const unitSize = asNumber(c?.stats?.size, 1);

  const abilities = useMemo(() => {
    const comps = Array.isArray(c?.components) ? c.components : [];
    return comps.filter((x: any) => x?.componentType === "ABILITY");
  }, [c]);

  const grouped = useMemo(() => groupAbilities(abilities), [abilities]);

  const resourcesOnCard = useMemo(() => {
    const res: Record<string, any> = c?.resources ?? {};
    const out = formatTokenCosts(res);
    return out;
  }, [c]);

  const tags = Array.isArray(c?.tags) ? c.tags : [];
  const typeHelp = TYPE_HELP[c?.type] ?? "Card type.";
  const typeLabel = String(c?.type ?? "—");

  const subtitle = (() => {
    const bits: string[] = [];
    if (faction) bits.push(faction);
    if (primaryType) bits.push(primaryType);
    if (bits.length === 0) return "";
    return bits.join(" • ");
  })();

  return (
    <div className={wrapperClass}>
      {/* Corner icons for units */}
      {c?.type === "UNIT" ? (
        <>
          <div className="cpCorner cpCornerLeft" title={faction ? `Faction: ${faction}` : "Faction"}>
            <div className="cpCornerText">{abbreviate(faction, 3)}</div>
          </div>
          <div className="cpCorner cpCornerRight" title={primaryType ? `Type: ${primaryType}` : "Type"}>
            <div className="cpCornerText">{abbreviate(primaryType, 3)}</div>
          </div>
        </>
      ) : null}

      <div className="cpHeader">
        <div style={{ minWidth: 0 }}>
          <div className="cpName" title={String(c?.name ?? "")}>
            {String(c?.name ?? "Unnamed Card")}
          </div>
          {subtitle ? (
            <div className="small" style={{ marginTop: 2 }}>
              {subtitle}
            </div>
          ) : null}
        </div>

        <div className="cpTypeLine" title={typeHelp}>
          {typeLabel}
        </div>
      </div>

      <div className="cpImageWrap">
        {imgUrl ? (
          <img className="cpImage" src={imgUrl} alt={String(c?.name ?? "card")} style={{ objectPosition: objPos }} />
        ) : (
          <div className="cpImagePlaceholder">
            <div className="cpImagePlaceholderTitle">No Art</div>
            <div className="cpImagePlaceholderSub">Upload an image or paste a URL</div>
          </div>
        )}
      </div>

      {/* Unit Stat Strip */}
      {c?.type === "UNIT" ? (
        <div className="cpStats">
          <div className="cpPill" title="Hit Points">
            <div className="cpPillLabel">HP</div>
            <div className="cpPillValue">{unitHp}</div>
          </div>
          <div className="cpPill" title="Action Points per round">
            <div className="cpPillLabel">AP</div>
            <div className="cpPillValue">{unitAp}</div>
          </div>
          <div className="cpPill" title="Movement (tiles per round)">
            <div className="cpPillLabel">MOVE</div>
            <div className="cpPillValue">{unitMove}</div>
          </div>
          <div className="cpPill" title="Size (affects some abilities)">
            <div className="cpPillLabel">SIZE</div>
            <div className="cpPillValue">{unitSize}</div>
          </div>
        </div>
      ) : (
        <div className="cpStats" />
      )}

      <div className="cpBody">
        {/* Abilities grouped by trigger */}
        {Object.keys(grouped).length ? (
          Object.entries(grouped).map(([trigger, list]) => {
            const title = sectionTitleForTrigger(trigger);
            const trigHelp = TRIGGER_HELP[trigger] ?? "Trigger.";
            return (
              <div key={trigger} className="cpSection">
                <div className="cpSectionTitle" title={trigHelp}>
                  {title}
                </div>

                <div className="cpSectionList">
                  {list.map((a: any, idx: number) => {
                    const ap = Math.max(0, Math.floor(Number(a?.cost?.ap ?? 0)));
                    const tokenCosts = formatTokenCosts(a?.cost?.tokens);
                    const trig = String(a?.trigger ?? "—");
                    const tType = String(a?.targeting?.type ?? "");
                    const tRange = a?.targeting?.range;
                    const minR = typeof tRange?.min === "number" ? tRange.min : 0;
                    const maxR =
                      typeof tRange?.max === "number"
                        ? tRange.max
                        : typeof tRange?.base === "number"
                        ? tRange.base
                        : 0;

                    const targetingHint =
                      tType && tType !== "SELF"
                        ? `Targeting: ${tType}${maxR ? ` • Range ${minR}-${maxR}` : ""}`
                        : tType
                        ? `Targeting: ${tType}`
                        : "";

                    return (
                      <div key={`${trigger}-${idx}`} className="cpAbility">
                        <div className="cpAbilityTop">
                          <div style={{ minWidth: 0 }}>
                            <div className="cpAbilityName" title={String(a?.name ?? "")}>
                              {String(a?.name ?? "Ability")}
                            </div>
                            {targetingHint ? (
                              <div className="small" style={{ marginTop: 3 }}>
                                {targetingHint}
                              </div>
                            ) : null}
                          </div>

                          <div className="cpAbilityMeta">
                            <span className="cpTriggerChip" title={TRIGGER_HELP[trig] ?? trig}>
                              {trig}
                            </span>

                            {/* AP token */}
                            {ap > 0 ? (
                              <span className="cpApToken" title={`AP Cost: ${ap}`}>
                                <span className="cpApCircle">AP</span>
                                <span className="cpApNum">{ap}</span>
                              </span>
                            ) : null}

                            {/* Token costs */}
                            {tokenCosts.map((t) => (
                              <span
                                key={t.k}
                                className="cpTriggerChip"
                                title={`${t.label} cost: ${t.v}`}
                                style={{ fontWeight: 900 }}
                              >
                                {t.k} {t.v}
                              </span>
                            ))}
                          </div>
                        </div>

                        {a?.description ? <div className="cpAbilityDesc">{String(a.description)}</div> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        ) : (
          <div className="small">No abilities yet.</div>
        )}

        {/* Tags / Attributes */}
        {tags.length || (Array.isArray(c?.attributes) && c.attributes.length) ? (
          <div className="cpSection">
            <div className="cpSectionTitle" title="Keywords and elemental/material attributes.">
              Tags
            </div>
            <div className="cpChips">
              {tags.map((t: string) => (
                <span key={t} className="cpChip">
                  {t}
                </span>
              ))}
              {(Array.isArray(c?.attributes) ? c.attributes : []).map((a: string) => (
                <span key={`attr-${a}`} className="cpChip" title="Attribute">
                  {a}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Resources stored on the card/unit */}
        {resourcesOnCard.length ? (
          <div className="cpSection">
            <div className="cpSectionTitle" title="Tokens stored on this card/unit (not costs).">
              Stored Tokens
            </div>
            <div className="cpChips">
              {resourcesOnCard.map((r) => (
                <span key={`res-${r.k}`} className="cpChip" title={r.label}>
                  {r.k} {r.v}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="cpFooter">
        <div className="cpFooterLine" title="Template + theme used for preview rendering">
          {tpl} • {String(c?.presentation?.theme ?? "BLUE")}
        </div>
      </div>
    </div>
  );
}

export default CardPreview;
