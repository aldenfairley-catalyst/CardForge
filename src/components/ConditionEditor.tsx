import React from "react";
import type { Condition, Expr, EntityRef } from "../lib/types";
import { ExpressionEditor } from "./ExpressionEditor";
import { EntityRefEditor } from "./EntityRefEditor";

type Props = { value: Condition; onChange: (next: Condition) => void };

const conditionTypes = ["ALWAYS","NOT","AND","OR","COMPARE_NUMBERS","HAS_TAG","COUNT_UNITS_ON_BOARD"] as const;
type ConditionType = typeof conditionTypes[number];

export function ConditionEditor({ value, onChange }: Props) {
  function setType(t: ConditionType) {
    if (t === "ALWAYS") return onChange({ type: "ALWAYS" });
    if (t === "NOT") return onChange({ type: "NOT", condition: { type: "ALWAYS" } });
    if (t === "AND") return onChange({ type: "AND", conditions: [{ type: "ALWAYS" }] });
    if (t === "OR") return onChange({ type: "OR", conditions: [{ type: "ALWAYS" }] });
    if (t === "COMPARE_NUMBERS") return onChange({
      type:"COMPARE_NUMBERS",
      lhs:{ type:"CONST_NUMBER", value: 1 },
      op:">=",
      rhs:{ type:"CONST_NUMBER", value: 1 }
    });
    if (t === "HAS_TAG") return onChange({ type:"HAS_TAG", entity:{type:"TARGET"}, tag:"DRUMMER" } as any);
    return onChange({ type:"COUNT_UNITS_ON_BOARD", targetTag:"DRUMMER", min: 1, faction:"ALLY" } as any);
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 10, background: "rgba(255,255,255,.04)" }}>
      <div className="small">Condition Type</div>
      <select className="select" value={value.type} onChange={(e)=>setType(e.target.value as ConditionType)}>
        {conditionTypes.map(t => <option key={t} value={t}>{t}</option>)}
      </select>

      <div style={{ marginTop: 10 }}>
        {value.type === "NOT" && (
          <>
            <div className="small">Inner</div>
            <ConditionEditor value={value.condition} onChange={(condition)=>onChange({ ...value, condition })} />
          </>
        )}

        {(value.type === "AND" || value.type === "OR") && (
          <>
            <div className="small">Conditions</div>
            <div style={{ display:"grid", gap: 10 }}>
              {value.conditions.map((c, idx) => (
                <div key={idx}>
                  <ConditionEditor
                    value={c}
                    onChange={(next)=> {
                      const conditions = value.conditions.slice();
                      conditions[idx] = next;
                      onChange({ ...value, conditions } as any);
                    }}
                  />
                  <button className="btn btnDanger" style={{ marginTop: 6 }} onClick={() => {
                    const conditions = value.conditions.slice();
                    conditions.splice(idx, 1);
                    onChange({ ...value, conditions: conditions.length ? conditions : [{ type:"ALWAYS" }] } as any);
                  }}>
                    Remove
                  </button>
                </div>
              ))}
              <button className="btn" onClick={() => onChange({ ...value, conditions: [...value.conditions, { type:"ALWAYS" }] } as any)}>
                + Add Condition
              </button>
            </div>
          </>
        )}

        {value.type === "COMPARE_NUMBERS" && (
          <>
            <div className="small">LHS</div>
            <ExpressionEditor value={value.lhs as Expr} onChange={(lhs)=>onChange({ ...value, lhs } as any)} />
            <div className="small" style={{ marginTop: 8 }}>Operator</div>
            <select className="select" value={value.op} onChange={(e)=>onChange({ ...value, op: e.target.value as any } as any)}>
              {[" >",">=","==","!=","<=","<"].map(op => <option key={op} value={op}>{op}</option>)}
            </select>
            <div className="small" style={{ marginTop: 8 }}>RHS</div>
            <ExpressionEditor value={value.rhs as Expr} onChange={(rhs)=>onChange({ ...value, rhs } as any)} />
          </>
        )}

        {value.type === "HAS_TAG" && (
          <>
            <div className="small">Entity</div>
            <EntityRefEditor value={value.entity as EntityRef} onChange={(entity)=>onChange({ ...value, entity } as any)} />
            <div className="small" style={{ marginTop: 8 }}>Tag</div>
            <input className="input" value={value.tag} onChange={(e)=>onChange({ ...value, tag: e.target.value } as any)} />
          </>
        )}

        {value.type === "COUNT_UNITS_ON_BOARD" && (
          <>
            <div className="small">Target Tag</div>
            <input className="input" value={value.targetTag} onChange={(e)=>onChange({ ...value, targetTag: e.target.value } as any)} />
            <div style={{ display:"flex", gap:8, marginTop:8 }}>
              <div style={{ flex:1 }}>
                <div className="small">Min</div>
                <input className="input" type="number" value={value.min} onChange={(e)=>onChange({ ...value, min: Number(e.target.value) } as any)} />
              </div>
              <div style={{ flex:1 }}>
                <div className="small">Faction</div>
                <select className="select" value={value.faction ?? "ANY"} onChange={(e)=>onChange({ ...value, faction: e.target.value } as any)}>
                  {["ANY","ALLY","ENEMY"].map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
          </>
        )}
      </div>

      <details style={{ marginTop: 10 }}>
        <summary className="small" style={{ cursor: "pointer" }}>Raw JSON</summary>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </details>
    </div>
  );
}
