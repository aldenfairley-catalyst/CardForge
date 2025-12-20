import registry from "../assets/blockRegistry.json";

export const blockRegistry = registry;

export function isStepTypeAllowed(t: string) {
  return (blockRegistry.steps.types as string[]).includes(t);
}
