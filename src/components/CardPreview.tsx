import React, { useMemo } from "react";
import type { AbilityComponent, CardEntity } from "../lib/types";
import { blockRegistry } from "../lib/registry";

type TemplateId = "T1" | "T2" | "T3" | "T4" | "T5";
type ThemeId = "BLUE" | "GREEN" | "PURPLE" | "ORANGE" | "RED";

const typeHelp: Record<string, string> = {
  UNIT: "A controllable character on the board. Has stats, can move, act, and hold items.",
  ITEM: "Equippable gear or relics that can modify stats and/or inject abilities.",
  SPELL: "Played from hand. Usually resolves an effect and may not remain on board.",
  ENVIRONMENT: "Terrain, obstacles, hazards, or interactive objects on the board.",
  TOKEN: "A temporary marker/resource/status representation."
};

const triggerHelp: Record<string, string> = {
  ACTIVE_ACTION: "Player chooses to use this action (typically costs AP).",
  PASSIVE_AURA: "Always-on effect that applies while conditions are met.",
  REACTION: "Can be used during a reaction window (interrupt/response).",
  ON_DEATH: "Triggers when the unit/entity is destroyed.",
  ON_SPAWN: "Triggers when the unit/entity enters play.",
  ON_TURN_START: "Triggers at the start of the owner’s turn.",
  ON_TURN_END: "Triggers at the end of the owner’s turn."
};

const stepHelp: Record<string, string> = {
  ROLL_D6: "Roll a six-sided die and optionally save the result.",
  ROLL_D20: "Roll a twenty-sided die and optionally save the result.",
  SET_VARIABLE: "Compute a value and store it under saveAs for later steps.",
  OPPONENT_SAVE: "Target makes a save check. Branch into onFail/onSuccess.",
  DEAL_DAMAGE: "Deal damage of a given type to a target entity.",
  HEAL: "Restore HP to a target entity.",
  APPLY_STATUS: "Apply a named status for a duration.",
  REMOVE_STATUS: "Remove a named status from a target.",
  MOVE_ENTITY: "Move an entity up to maxTiles to a chosen position.",
  SHOW_TEXT: "Write a log/message line.",
  IF_ELSE: "Branch based on a condition.",
  OPEN_REACTION_WINDOW: "Open a reaction window at a defined timing."
};

function abbrev(s?: string) {
  if (!s) return "";
  const t = s.trim();
  if (!t) return "";
  const parts = t.split(/\s+/g);
  const a = parts.length >= 2 ? (parts[0][0] + parts[1][0]) : t.slice(0, 2);
  return a.toUpperCase();
}

function defaultTemplateFor(card: CardEntity): TemplateId {
  switch (card.type) {
    case "UNIT": return "T1";
    case "ITEM": return "T2";
    case "SPELL": return "T3";
    case "ENVIRONMENT": return "T4";
    case "TOKEN": return "T5";
    default: return "T1";
  }
}

function themeClass(theme?: ThemeId) {
  const t = (theme ?? "BLUE").toLowerCase();
  return `theme-${t}`;
}

function templateClass(tpl?: TemplateId) {
  const t = (tpl ?? "T1").toLowerCase();
  return `tpl-${t}`;
}

function getAbilities(card: CardEntity): AbilityComponent[] {
  return card.components.filter((c: any) => c?.componentType === "ABILITY") as AbilityComponent[];
}

function uniqueStepTypes(a: AbilityComponent): string[] {
  const types = new Set<string>();
  const steps = a.execution?.steps ?? [];
  for (const s of steps as any[]) {
    if (s?.type && s.type !== "UNKNOWN_STEP") types.add(s.type);
  }
  return Array.from(types);
}

function statValue(card: CardEntity, key: string): number | null {
  const s: any = card.stats ?? {};
  // match both lowercase and canonical keys if you later normalize
  const direct = s?.[key];
  if (typeof direct === "number") return direct;
  return null;
}

function hpMax(card: CardEntity): number | null {
  const hp = (card.stats as any)?.hp;
  const v = hp?.max;
  return typeof v === "number" ? v : null;
}
function apMax(card: CardEntity): number | null {
  const ap = (card.stats as any)?.ap;
  const v = ap?.max;
  return typeof v === "number" ? v : null;
}

function Pill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="cpPill">
      <span className="cpPillLabel">{label}</span>
      <span className="cpPillValue">{value}</span>
    </div>
  );
}

function ApToken({ ap }: { ap: number }) {
  return (
    <span className="cpApToken" title="AP cost">
      <span className="cpApCircle">AP</span>
      <span className="cpApNum">{ap}</span>
    </span>
  );
}

function StepChips({ types }: { types: string[] }) {
  if (!types.length) return null;
  return (
    <div className="cpChips">
      {types.map((t) => (
        <span
          key={t}
          className="cpChip"
          title={stepHelp[t] ?? "Execution step"}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

/**
 * 5 templates:
 * T1 Unit (hero/unit focus)
 * T2 Item (equipment focus)
 * T3 Spell (hand-play focus)
 * T4 Environment (terrain focus)
 * T5 Token (simple)
 */
export function CardPreview({ card }: { card: CardEntity }) {
  const tpl = (card.presentation?.template as TemplateId | undefined) ?? defaultTemplateFor(card);
  const theme = (card.presentation?.theme as ThemeId | undefined) ?? "BLUE";
  const abilities = useMemo(() => getAbilities(card), [card]);

  const faction = card.faction;
  const unitType = (card.subType && card.subType.length) ? card.subType[0] : undefined;

  const img = card.visuals?.cardImage;

  const headerRight = (
    <div className="cpTypeLine" title={typeHelp[card.type] ?? "Card type"}>
      Type: <b>{card.type}</b>
    </div>
  );

  const sections = useMemo(() => {
    const groups: Record<string, AbilityComponent[]> = {
      Abilities: [],
      "Passive Effects": [],
      Reactions: [],
      "Other Effects": []
    };

    for (const a of abilities) {
      if (a.trigger === "ACTIVE_ACTION") groups["Abilities"].push(a);
      else if (a.trigger === "PASSIVE_AURA") groups["Passive Effects"].push(a);
      else if (a.trigger === "REACTION") groups["Reactions"].push(a);
      else groups["Other Effects"].push(a);
    }

    // Hide empty groups
    return Object.entries(groups).filter(([, list]) => list.length > 0);
  }, [abilities]);

  return (
    <div className={`cardPreview ${themeClass(theme)} ${templateClass(tpl)}`}>
      {/* Corner badges only for Units (as requested) */}
      {card.type === "UNIT" && faction ? (
        <div className="cpCorner cpCornerLeft" title={`Faction: ${faction}`}>
          <span className="cpCornerText">{abbrev(faction)}</span>
        </div>
      ) : null}

      {card.type === "UNIT" && unitType ? (
        <div className="cpCorner cpCornerRight" title={`Type: ${unitType}`}>
          <span className="cpCornerText">{abbrev(unitType)}</span>
        </div>
      ) : null}

      <div className="cpHeader">
        <div className="cpName" title={card.name}>{card.name}</div>
        {headerRight}
      </div>

      <div className="cpImageWrap">
        {img ? (
          <img className="cpImage" src={img} alt={card.name} />
        ) : (
          <div className="cpImagePlaceholder">
            <div className="cpImagePlaceholderTitle">No Image</div>
            <div className="cpImagePlaceholderSub">Paste an image URL in the Inspector</div>
          </div>
        )}
      </div>

      {/* Template-specific stat bars */}
      {tpl === "T1" && (
        <div className="cpStats">
          {hpMax(card) != null ? <Pill label="HP" value={hpMax(card)!} /> : null}
          {apMax(card) != null ? <Pill label="AP" value={apMax(card)!} /> : null}
          {statValue(card, "speed") != null ? <Pill label="SPD" value={statValue(card, "speed")!} /> : null}
          {statValue(card, "resilience") != null ? <Pill label="RES" value={statValue(card, "resilience")!} /> : null}
        </div>
      )}

      {tpl === "T2" && (
        <div className="cpStats">
          {statValue(card, "strength") != null ? <Pill label="STR" value={statValue(card, "strength")!} /> : null}
          {statValue(card, "coordination") != null ? <Pill label="COORD" value={statValue(card, "coordination")!} /> : null}
          {((card.resources?.aether ?? 0) > 0) ? <Pill label="AETH" value={card.resources!.aether!} /> : null}
          {((card.resources?.umbra ?? 0) > 0) ? <Pill label="UMB" value={card.resources!.umbra!} /> : null}
        </div>
      )}

      {tpl === "T3" && (
        <div className="cpStats">
          {((card.resources?.aether ?? 0) > 0) ? <Pill label="AETH" value={card.resources!.aether!} /> : null}
          {((card.resources?.umbra ?? 0) > 0) ? <Pill label="UMB" value={card.resources!.umbra!} /> : null}
          {statValue(card, "intelligence") != null ? <Pill label="INT" value={statValue(card, "intelligence")!} /> : null}
          {statValue(card, "wisdom") != null ? <Pill label="WIS" value={statValue(card, "wisdom")!} /> : null}
        </div>
      )}

      {tpl === "T4" && (
        <div className="cpStats">
          {hpMax(card) != null ? <Pill label="HP" value={hpMax(card)!} /> : null}
          <Pill label="TERR" value={(card.type === "ENVIRONMENT") ? "Yes" : "—"} />
          {(card.tags?.length ?? 0) > 0 ? <Pill label="TAGS" value={card.tags!.length} /> : null}
        </div>
      )}

      {tpl === "T5" && (
        <div className="cpStats">
          {(card.resources?.aether ?? 0) > 0 ? <Pill label="AETH" value={card.resources!.aether!} /> : null}
          {(card.resources?.umbra ?? 0) > 0 ? <Pill label="UMB" value={card.resources!.umbra!} /> : null}
          {(card.resources?.strength ?? 0) > 0 ? <Pill label="STR" value={card.resources!.strength!} /> : null}
        </div>
      )}

      <div className="cpBody">
        {sections.map(([title, list]) => (
          <div key={title} className="cpSection">
            <div className="cpSectionTitle">{title}</div>
            <div className="cpSectionList">
              {list.map((a, i) => {
                const ap = a.cost?.ap ?? 0;
                const stepTypes = uniqueStepTypes(a);
                return (
                  <div key={`${a.name}-${i}`} className="cpAbility">
                    <div className="cpAbilityTop">
                      <div className="cpAbilityName">{a.name}</div>
                      <div className="cpAbilityMeta">
                        {ap > 0 ? <ApToken ap={ap} /> : null}
                        <span className="cpTriggerChip" title={triggerHelp[a.trigger] ?? "Trigger"}>
                          {a.trigger}
                        </span>
                      </div>
                    </div>

                    {a.description ? <div className="cpAbilityDesc">{a.description}</div> : null}

                    <StepChips types={stepTypes} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="cpFooter">
        {(card.attributes?.length ?? 0) > 0 ? (
          <div className="cpFooterLine" title="Attributes">
            Attr: {card.attributes!.join(", ")}
          </div>
        ) : (
          <div className="cpFooterLine" title="Tip">
            Hover labels for rules help • Template {tpl} • Theme {theme}
          </div>
        )}
      </div>
    </div>
  );
}
