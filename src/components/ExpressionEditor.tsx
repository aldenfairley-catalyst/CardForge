import React from "react";
import type { Expr, EntityRef } from "../lib/types";
import { EntityRefEditor } from "./EntityRefEditor";

type Props = {
  value: Expr;
  onChange: (next: Expr) => void;
};

const exprTypes = ["CONST_NUMBER","SAVED_VALUE","READ_STAT","ADD","SUBTRACT","MULTIPLY","DIVIDE","MIN","MAX"] as const;
type ExprType = typeof exprTypes[number];

function isBinary(t: Expr["type"]) {
  return ["ADD","SUBTRACT","MULTIPLY","DIVIDE","MIN","MAX"].includes(t);
}

export function ExpressionEditor({ value, onChange }: Props) {
  function setType(t: ExprType) {
    // minimal coercion when switching types
    if (t === "CONST_NUMBER") return onChange({ type: "CONST_NUMBER", value: 0 });
    if (t === "SAVED_VALUE") return onChange({ type: "SAVED_VALUE", key: "var" });
    if (t === "READ_STAT") return onChange({ type:"READ_STAT", entity:{type:"SELF"}, stat:"SPEED" });

    // binary ops
    return onChange({
      type: t as any,
      a: { type: "CONST_NUMBER", value: 1 },
      b: { type: "CONST_NUMBER", value: 1 }
    } as any);
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 10, background: "rgba(255,255,255,.04)" }}>
      <div className="small">Expression Type</div>
      <select
        className="select"
        value={value.type}
        onChange={(e) => setType(e.target.value as ExprType)}
      >
        {exprTypes.map(t => <option key={t} value={t}>{t}</option>)}
      </select>

      <div style={{ marginTop: 10 }}>
        {value.type === "CONST_NUMBER" && (
          <>
            <div className="small">Value</div>
            <input
              className="input"
              type="number"
              value={value.value}
              onChange={(e) => onChange({ ...value, value: Number(e.target.value) })}
            />
          </>
        )}

        {value.type === "SAVED_VALUE" && (
          <>
            <div className="small">Saved Key</div>
            <input
              className="input"
              value={value.key}
              onChange={(e) => onChange({ ...value, key: e.target.value })}
            />
          </>
        )}

        {value.type === "READ_STAT" && (
          <>
            <div className="small">Entity</div>
            <EntityRefEditor
              value={value.entity}
              onChange={(entity: EntityRef) => onChange({ ...value, entity })}
            />
            <div className="small" style={{ marginTop: 8 }}>Stat</div>
            <input
              className="input"
              value={value.stat}
              onChange={(e) => onChange({ ...value, stat: e.target.value })}
              placeholder="SPEED, WISDOM..."
            />
          </>
        )}

        {isBinary(value.type) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            <div>
              <div className="small">A</div>
              <ExpressionEditor value={value.a} onChange={(a) => onChange({ ...value, a } as any)} />
            </div>
            <div>
              <div className="small">B</div>
              <ExpressionEditor value={value.b} onChange={(b) => onChange({ ...value, b } as any)} />
            </div>
          </div>
        )}
      </div>

      <details style={{ marginTop: 10 }}>
        <summary className="small" style={{ cursor: "pointer" }}>Raw JSON</summary>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </details>
    </div>
  );
}
