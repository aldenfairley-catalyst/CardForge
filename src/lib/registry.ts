// src/lib/registry.ts
import rawRegistry from "../assets/blockRegistry.json";

const EXTRA_STEP_TYPES = [
  "SELECT_TARGETS",
  "FOR_EACH_TARGET",
  "SET_STATE",
  "TOGGLE_STATE"
] as const;

function uniq(arr: string[]) {
  return Array.from(new Set(arr));
}

function extendRegistry(reg: any) {
  const next = {
    ...(reg ?? {}),
    steps: {
      ...((reg ?? {}).steps ?? {})
    }
  };

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
