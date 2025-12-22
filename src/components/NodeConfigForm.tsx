import React from "react";

type Schema = {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
};

export type NodeConfigFormProps = {
  schema: Schema;
  value: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
};

function ensureDefault(schema: Schema) {
  const next: Record<string, any> = {};
  Object.entries(schema.properties ?? {}).forEach(([key, prop]) => {
    if (prop && Object.prototype.hasOwnProperty.call(prop, "default")) {
      next[key] = prop.default;
    }
  });
  return next;
}

export function coerceConfig(schema: Schema, value: Record<string, any>) {
  return { ...ensureDefault(schema), ...(value ?? {}) };
}

export function NodeConfigForm({ schema, value, onChange }: NodeConfigFormProps) {
  const props = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  const current = coerceConfig(schema, value);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Object.entries(props).map(([key, prop]: any) => {
        const label = `${key}${required.has(key) ? " *" : ""}`;
        if (prop.type === "string") {
          return (
            <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="small">{label}</span>
              <input
                className="input"
                value={current[key] ?? prop.default ?? ""}
                onChange={(e) => onChange({ ...current, [key]: e.target.value })}
              />
            </label>
          );
        }
        if (prop.type === "number" || prop.type === "integer") {
          return (
            <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="small">{label}</span>
              <input
                className="input"
                type="number"
                value={current[key] ?? prop.default ?? 0}
                onChange={(e) => onChange({ ...current, [key]: prop.type === "integer" ? Number(e.target.value) || 0 : Number(e.target.value) })}
              />
            </label>
          );
        }
        if (prop.type === "boolean") {
          return (
            <label key={key} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={Boolean(current[key] ?? prop.default)}
                onChange={(e) => onChange({ ...current, [key]: e.target.checked })}
              />
              <span className="small">{label}</span>
            </label>
          );
        }
        return (
          <div key={key} className="small">
            Unsupported field type for {key}
          </div>
        );
      })}
    </div>
  );
}
