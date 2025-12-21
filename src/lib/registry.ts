import registry from "../assets/blockRegistry.json";
import registryUrl from "../assets/blockRegistry.json?url";

export const blockRegistry = registry as any;
export const blockRegistryVersion = String((blockRegistry as any)?.schemaVersion ?? "BR-UNKNOWN");
export const blockRegistryCacheBustingUrl = `${registryUrl}${registryUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(
  blockRegistryVersion
)}`;

export function isStepTypeAllowed(t: string) {
  return (blockRegistry.steps.types as string[]).includes(t);
}

export type StepGroup = { id: string; label: string; types: string[] };

export function getStepGroups(): StepGroup[] {
  const groups = (blockRegistry.steps?.groups ?? []) as any[];
  if (Array.isArray(groups) && groups.length) {
    return groups.map((g) => ({
      id: String(g.id),
      label: String(g.label ?? g.id),
      types: Array.isArray(g.types) ? (g.types as string[]) : []
    }));
  }
  return [{ id: "core", label: "All Steps", types: blockRegistry.steps.types as string[] }];
}
