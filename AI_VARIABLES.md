
# Captain Jawa Forge — Variables & References (CJ-1.1+)

## Token Keys (canonical abbreviations)
| Token | Key |
|---|---|
| Umbra | UMB |
| Aether | AET |
| Coordination | CRD |
| Charisma | CHR |
| Strength | STR |
| Resilience | RES |
| Wisdom | WIS |
| Intelligence | INT |
| Speed | SPD |
| Awareness | AWR |

## Target References
| TargetRef | Meaning |
|---|---|
| `{ "type":"SELF" }` | source unit |
| `{ "type":"TARGET" }` | legacy selected target |
| `{ "type":"ITERATION_TARGET" }` | only inside FOR_EACH_TARGET |
| `{ "type":"TARGET_SET", "ref":"primary" }` | explicit saved target set |
| `{ "type":"EQUIPPED_ITEM", "itemId":"...", "of": { "type":"SELF" } }` | item instance for state |

## Printed token value vs spent cost
- Printed token value: card field used by minigames
- Cost tokens: ability activation spend
