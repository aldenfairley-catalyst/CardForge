import { v4 as uuidv4 } from "uuid";
import { LATEST_SCHEMA_VERSION } from "./migrations";
import type { CardEntity, AbilityComponent } from "./types";

export function makeDefaultCard(): CardEntity {
  return {
    schemaVersion: LATEST_SCHEMA_VERSION,
    id: uuidv4(),
    name: "New Card",
    type: "UNIT",
    tags: [],
    components: [
      {
        componentType: "ABILITY",
        name: "New Ability",
        description: "",
        trigger: "ACTIVE_ACTION",
        cost: { ap: 1 },
        targeting: { type: "SINGLE_TARGET", range: { base: 4 }, lineOfSight: true },
        execution: { steps: [{ type: "SHOW_TEXT", text: "Do something!" }] }
      }
    ]
  };
}

export function abilitySummary(a: AbilityComponent) {
  const cost = a.cost?.ap != null ? `${a.cost.ap} AP` : "";
  const targ = a.targeting?.type ? `Target: ${a.targeting.type}` : "Target: —";
  const count = a.execution?.steps?.length ?? 0;
  return [cost, targ, `${count} steps`].filter(Boolean).join(" • ");
}

export function canonicalToGraph(card: CardEntity) {
  const abilityIdx = card.components.findIndex((c: any) => c.componentType === "ABILITY");
  if (abilityIdx < 0) return { nodes: [], edges: [] };

  const X0 = 50, Y0 = 40;
  const nodes: any[] = [];
  const edges: any[] = [];

  const rootId = `ab-${abilityIdx}-root`;
  const costId = `ab-${abilityIdx}-cost`;
  const targId = `ab-${abilityIdx}-targ`;
  const execId = `ab-${abilityIdx}-exec`;

  nodes.push({ id: rootId, type: "abilityRoot", position: { x: X0, y: Y0 }, data: { kind:"ABILITY_ROOT", abilityIdx } });
  nodes.push({ id: costId, type: "meta", position: { x: X0 + 340, y: Y0 }, data: { kind:"COST", abilityIdx } });
  nodes.push({ id: targId, type: "meta", position: { x: X0 + 340, y: Y0 + 140 }, data: { kind:"TARGETING", abilityIdx } });
  nodes.push({ id: execId, type: "exec", position: { x: X0, y: Y0 + 220 }, data: { kind:"EXEC", abilityIdx } });

  edges.push({ id: uuidv4(), source: rootId, target: costId });
  edges.push({ id: uuidv4(), source: rootId, target: targId });
  edges.push({ id: uuidv4(), source: rootId, target: execId });

  const ability = card.components[abilityIdx] as any;
  const steps = (ability.execution?.steps ?? []) as any[];

  steps.forEach((_: any, i: number) => {
    const id = `ab-${abilityIdx}-step-${i}`;
    nodes.push({ id, type: "step", position: { x: X0 + 30, y: Y0 + 360 + i * 110 }, data: { kind:"STEP", abilityIdx, stepIdx: i } });
    edges.push({ id: uuidv4(), source: execId, target: id });
    if (i > 0) edges.push({ id: uuidv4(), source: `ab-${abilityIdx}-step-${i-1}`, target: id });
  });

  return { nodes, edges };
}
