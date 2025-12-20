const KEY = "cj_forge_last_card_v1";

export function saveCardJson(json: string) {
  localStorage.setItem(KEY, json);
}
export function loadCardJson() {
  return localStorage.getItem(KEY);
}
export function clearSaved() {
  localStorage.removeItem(KEY);
}
