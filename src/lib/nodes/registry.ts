import registryJson from "../../assets/nodeRegistry.json";
import { PinKind, type DataType, type GraphNode, type NodeDefinition, type PinDefinition } from "../graphIR/types";

export type NodeRegistry = {
  nodeRegistryVersion: string;
  dataTypes: DataType[];
  nodes: NodeDefinition[];
};

export type NodeDef = NodeDefinition;
export type PinDef = PinDefinition;

const registry = registryJson as NodeRegistry;

function clampInt(value: any, min: number, max: number) {
  const parsed = Number.isFinite(Number(value)) ? Number(value) : 0;
  const bounded = Math.max(min, Math.min(max, Math.round(parsed)));
  return bounded;
}

export function getRegistry(): NodeRegistry {
  return registry;
}

export function getNodeDef(nodeType: string): NodeDefinition | null {
  return registry.nodes.find((n) => n.nodeType === nodeType) ?? null;
}

export function listNodesByCategory() {
  const groups: Record<string, NodeDefinition[]> = {};
  registry.nodes.forEach((n) => {
    if (!groups[n.category]) groups[n.category] = [];
    groups[n.category].push(n);
  });
  const grouped = Object.entries(groups).map(([category, nodes]) => ({
    category,
    nodes: [...nodes].sort((a, b) => a.label.localeCompare(b.label))
  }));
  return grouped.sort((a, b) => a.category.localeCompare(b.category));
}

function generateElseIfPins(def: NodeDefinition, config: Record<string, any>) {
  const template = def.pins?.dynamic;
  if (!template || template.kind !== "ELSEIF_PINS") return [];

  const propSchema = (def.configSchema?.properties ?? {})[template.sourceField] ?? {};
  const min = Number.isFinite(propSchema.minimum) ? propSchema.minimum : 0;
  const max = Number.isFinite(propSchema.maximum) ? propSchema.maximum : 6;
  const count = clampInt(config?.[template.sourceField] ?? 0, min, max);

  const pins: PinDefinition[] = [];
  for (let i = 0; i < count; i++) {
    for (const t of template.pinsPerIndex) {
      pins.push({
        id: t.idTemplate.replace("{i}", String(i)),
        label: t.labelTemplate.replace("{n}", String(i + 1)),
        group: t.group,
        kind: t.kind,
        direction: t.direction,
        dataType: t.dataType,
        required: t.required
      });
    }
  }
  return pins;
}

export function materializePins(nodeType: string, config: GraphNode["config"]): PinDefinition[] {
  const def = getNodeDef(nodeType);
  if (!def) return [];

  const pins: PinDefinition[] = [];
  const seen = new Set<string>();
  const addPin = (pin: PinDefinition) => {
    if (seen.has(pin.id)) throw new Error(`Duplicate pin id "${pin.id}" for nodeType ${nodeType}`);
    seen.add(pin.id);
    pins.push(pin);
  };

  (def.pins?.static ?? []).forEach(addPin);
  generateElseIfPins(def, config).forEach(addPin);

  return pins;
}

export function arePinsCompatible(outPin?: PinDefinition, inPin?: PinDefinition): boolean {
  if (!outPin || !inPin) return false;
  if (outPin.direction !== "OUT" || inPin.direction !== "IN") return false;
  if (outPin.kind !== inPin.kind) return false;

  if (outPin.kind === PinKind.CONTROL) return true;
  const source = outPin.dataType ?? "any";
  const target = inPin.dataType ?? "any";
  if (source === "any" || target === "any") return true;
  if (target === "json") return true;
  if (source === target) return true;
  const inUnion = Array.isArray((inPin as any).dataType)
    ? ((inPin as any).dataType as DataType[])
    : [target as DataType];
  return inUnion.includes(source as DataType);
}

export function getDefaultConfig(nodeType: string): Record<string, any> {
  const def = getNodeDef(nodeType);
  const schema = def?.configSchema ?? {};
  const props = schema.properties ?? {};
  const defaults: Record<string, any> = {};
  Object.entries(props).forEach(([key, value]: any) => {
    if (value && Object.prototype.hasOwnProperty.call(value, "default")) {
      defaults[key] = value.default;
      return;
    }
    if (Array.isArray(schema.required) && schema.required.includes(key)) {
      if (value?.type === "boolean") defaults[key] = false;
      else if (value?.type === "number" || value?.type === "integer") defaults[key] = 0;
      else if (value?.type === "string") defaults[key] = "";
    }
  });
  return defaults;
}

export const defaultConfigForNode = getDefaultConfig;
