import registry from "../assets/blockRegistry.json";

export const blockRegistry: any = registry;

export function isStepTypeAllowed(t: string) {
  return (blockRegistry.steps.types as string[]).includes(t);
}

export function getStepGroups(): Array<{ id: string; label: string; types: string[] }> {
  const g = blockRegistry.steps.groups;
  if (Array.isArray(g) && g.length) return g;
  // fallback: single group
  return [{ id: "all", label: "All Steps", types: blockRegistry.steps.types as string[] }];
}
