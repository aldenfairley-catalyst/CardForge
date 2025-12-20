import type { AbilityComponent, Step, TargetingProfile } from "./types";

export type ActionLibrary = {
  libraryVersion: "CJ-LIB-1.0";
  name: string;
  updatedAt: string;

  abilities: Array<{ id: string; name: string; ability: AbilityComponent }>;
  steps: Array<{ id: string; name: string; step: Step }>;
  targetingProfiles: Array<{ id: string; name: string; profile: TargetingProfile }>;

  // optional: store reusable policies and UI flows later
  meta?: Record<string, any>;
};

const LS_KEY = "CJ_ACTION_LIBRARY";
const LS_SOURCE_KEY = "CJ_ACTION_LIBRARY_SOURCE"; // {mode:'local'|'url', url?:string}

export function defaultLibrary(): ActionLibrary {
  return {
    libraryVersion: "CJ-LIB-1.0",
    name: "My Action Library",
    updatedAt: new Date().toISOString(),
    abilities: [],
    steps: [],
    targetingProfiles: []
  };
}

export function loadLibrary(): ActionLibrary {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return defaultLibrary();
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.libraryVersion !== "CJ-LIB-1.0") return defaultLibrary();
    return parsed as ActionLibrary;
  } catch {
    return defaultLibrary();
  }
}

export function saveLibrary(lib: ActionLibrary) {
  const next = { ...lib, updatedAt: new Date().toISOString() };
  localStorage.setItem(LS_KEY, JSON.stringify(next));
}

export function getLibrarySource(): { mode: "local" | "url"; url?: string } {
  const raw = localStorage.getItem(LS_SOURCE_KEY);
  if (!raw) return { mode: "local" };
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.mode === "url") return { mode: "url", url: parsed.url };
    return { mode: "local" };
  } catch {
    return { mode: "local" };
  }
}

export function setLibrarySource(source: { mode: "local" | "url"; url?: string }) {
  localStorage.setItem(LS_SOURCE_KEY, JSON.stringify(source));
}

export function upsertAbility(lib: ActionLibrary, entry: { id: string; name: string; ability: AbilityComponent }) {
  const idx = lib.abilities.findIndex((a) => a.id === entry.id);
  const abilities = lib.abilities.slice();
  if (idx >= 0) abilities[idx] = entry;
  else abilities.push(entry);
  return { ...lib, abilities };
}

export function upsertStep(lib: ActionLibrary, entry: { id: string; name: string; step: Step }) {
  const idx = lib.steps.findIndex((a) => a.id === entry.id);
  const steps = lib.steps.slice();
  if (idx >= 0) steps[idx] = entry;
  else steps.push(entry);
  return { ...lib, steps };
}

export function upsertTargetingProfile(
  lib: ActionLibrary,
  entry: { id: string; name: string; profile: TargetingProfile }
) {
  const idx = lib.targetingProfiles.findIndex((a) => a.id === entry.id);
  const targetingProfiles = lib.targetingProfiles.slice();
  if (idx >= 0) targetingProfiles[idx] = entry;
  else targetingProfiles.push(entry);
  return { ...lib, targetingProfiles };
}

export function exportLibraryJson(lib: ActionLibrary) {
  return JSON.stringify(lib, null, 2);
}

export function importLibraryJson(text: string): ActionLibrary {
  const parsed = JSON.parse(text);
  if (!parsed || parsed.libraryVersion !== "CJ-LIB-1.0") throw new Error("Expected CJ-LIB-1.0");
  return parsed as ActionLibrary;
}

export async function relinkLibraryFromUrl(url: string): Promise<ActionLibrary> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const text = await res.text();
  return importLibraryJson(text);
}

