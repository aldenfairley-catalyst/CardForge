import registry from "../assets/blockRegistry.json";

export const blockRegistry = registry as any;

export function isStepTypeAllowed(stepType: string) {
  return (blockRegistry.steps?.types ?? []).includes(stepType);
}

export function getStepGroups(): Array<{ id: string; label: string; types: string[] }> {
  const groups = blockRegistry.steps?.groups;
  if (Array.isArray(groups) && groups.length) return groups;
  return [{ id: "core", label: "Core", types: blockRegistry.steps?.types ?? [] }];
}
