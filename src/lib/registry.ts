// src/lib/registry.ts
import rawRegistry from "../assets/blockRegistry.json";

// We extend the JSON registry at runtime so you don't have to keep
// editing the JSON file while we iterate on new step types.
const EXTRA_STEP_TYPES = ["SELECT_TARGETS", "FOR_EACH_TARGET"] as const;

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}

function extendRegistry(reg: any) {
  // Defensive copies so we don't mutate the imported JSON module
  const next = {
    ...(reg ?? {}),
    steps: {
      ...((reg ?? {}).steps ?? {})
    }
  };

  // Your JSON currently exposes step types at: blockRegistry.steps.types
  const types: string[] = Array.isArray(next.steps?.types) ? [...next.steps.types] : [];
  next.steps.types = uniq([...types, ...EXTRA_STEP_TYPES]);

  return next;
}

export const blockRegistry = extendRegistry(rawRegistry as any) as any;

export function isStepTypeAllowed(t: string) {
  if (!t) return false;
  const types = (blockRegistry.steps?.types as string[]) ?? [];
  return types.includes(t);
}
