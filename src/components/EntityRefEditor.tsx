import React from "react";
import type { EntityRef } from "../lib/types";

type Props = { value: EntityRef; onChange: (next: EntityRef) => void };

export function EntityRefEditor({ value, onChange }: Props) {
  const t = value.type;

  return (
    <div style={{ border:"1px solid var(--border)", borderRadius: 12, padding: 10, background:"rgba(0,0,0,.18)" }}>
      <div className="small">EntityRef Type</div>
      <select
        className="select"
        value={t}
        onChange={(e) => {
          const next = e.target.value as EntityRef["type"];
          if (next === "SELF") return onChange({ type: "SELF" });
          if (next === "TARGET") return onChange({ type: "TARGET" });
          if (next === "SOURCE") return onChange({ type: "SOURCE" });
          return onChange({
            type: "ENTITY_WITH_TAG",
            tag: "DRUMMER",
            selection: { mode: "NEAREST_TO_SELF", tieBreak: "LOWEST_ENTITY_ID" }
          });
        }}
      >
        {["SELF","TARGET","SOURCE","ENTITY_WITH_TAG"].map(x => <option key={x} value={x}>{x}</option>)}
      </select>

      {t === "ENTITY_WITH_TAG" && (
        <>
          <div className="small" style={{ marginTop: 8 }}>Tag</div>
          <input className="input" value={value.tag} onChange={(e)=>onChange({ ...value, tag: e.target.value } as any)} />
          <div className="small" style={{ marginTop: 8 }}>Selection</div>
          <div className="small">NEAREST_TO_SELF • tie LOWEST_ENTITY_ID</div>
        </>
      )}
    </div>
  );
}

