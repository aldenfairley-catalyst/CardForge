import registryJson from "../../assets/nodeRegistry.json";
import { PinKind, type DataType, type GraphNode, type NodeDefinition, type PinDefinition } from "../graphIR/types";

export type NodeRegistry = {
  nodeRegistryVersion: string;
  dataTypes: DataType[];
  nodes: NodeDefinition[];
};

const registry = registryJson as NodeRegistry;

export function getRegistry(): NodeRegistry {
  return registry;
}

export function getNodeDef(nodeType: string): NodeDefinition | undefined {
  return registry.nodes.find((n) => n.nodeType === nodeType);
}

export function listNodesByCategory() {
  const groups: Record<string, NodeDefinition[]> = {};
  registry.nodes.forEach((n) => {
    if (!groups[n.category]) groups[n.category] = [];
    groups[n.category].push(n);
  });
  return Object.entries(groups).map(([category, nodes]) => ({ category, nodes }));
}

function generateElseIfPins(template: NonNullable<NodeDefinition["pins"]["dynamic"]>, config: Record<string, any>) {
  if (template.kind !== "ELSEIF_PINS") return [];
  const count = Math.max(0, Math.min(6, Number(config?.[template.sourceField] ?? 0)));
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
  const staticPins = def.pins?.static ?? [];
  const dynamicTemplate = def.pins?.dynamic;
  const dynPins = dynamicTemplate ? generateElseIfPins(dynamicTemplate, config) : [];
  return [...staticPins, ...dynPins];
}

export function arePinsCompatible(outPin?: PinDefinition, inPin?: PinDefinition): boolean {
  if (!outPin || !inPin) return false;
  if (outPin.direction !== "OUT" || inPin.direction !== "IN") return false;
  if (outPin.kind !== inPin.kind) return false;

  if (outPin.kind === PinKind.CONTROL) return true;
  if (!outPin.dataType || !inPin.dataType) return false;
  if (inPin.dataType === "json") return true;
  if (outPin.dataType === inPin.dataType) return true;
  const inUnion = Array.isArray((inPin as any).dataType)
    ? ((inPin as any).dataType as DataType[])
    : [inPin.dataType as DataType];
  return inUnion.includes(outPin.dataType as DataType);
}

export function defaultConfigForNode(nodeType: string): Record<string, any> {
  const def = getNodeDef(nodeType);
  const schema = def?.configSchema ?? {};
  const props = schema.properties ?? {};
  const defaults: Record<string, any> = {};
  Object.entries(props).forEach(([key, value]: any) => {
    if (value && Object.prototype.hasOwnProperty.call(value, "default")) defaults[key] = value.default;
  });
  return defaults;
}
