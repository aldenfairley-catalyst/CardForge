import React from "react";
import type { EntityRef } from "../lib/types";

type Props = { value: EntityRef; onChange: (next: EntityRef) => void };

export function EntityRefEditor({ value, onChange }: Props) {
  const t = value.type;

  function handleSelect(next: EntityRef["type"]) {
    if (next === "SELF" || next === "TARGET" || next === "ITERATION_TARGET") return onChange({ type: next });
    return onChange({ type: "ENTITY_ID", id: (value as any).id ?? "" });
  }

  return (
    <div style={{ border:"1px solid var(--border)", borderRadius: 12, padding: 10, background:"rgba(0,0,0,.18)" }}>
      <div className="small">EntityRef Type</div>
      <select
        className="select"
        value={t}
        onChange={(e) => handleSelect(e.target.value as EntityRef["type"])}
      >
        {["SELF","TARGET","ITERATION_TARGET","ENTITY_ID"].map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>

      {t === "ENTITY_ID" && (
        <>
          <div className="small" style={{ marginTop: 8 }}>Entity ID</div>
          <input
            className="input"
            value={(value as any).id ?? ""}
            onChange={(e) => onChange({ type: "ENTITY_ID", id: e.target.value })}
            placeholder="entity-123"
          />
        </>
      )}
    </div>
  );
}
