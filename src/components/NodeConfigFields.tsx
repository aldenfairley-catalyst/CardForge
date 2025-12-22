import React from "react";

export type ConfigPropertySchema = {
  type?: "string" | "number" | "integer" | "boolean";
  title?: string;
  description?: string;
  default?: any;
  enum?: any[];
  minimum?: number;
  maximum?: number;
};

export type NodeConfigFieldProps = {
  field: string;
  schema: ConfigPropertySchema;
  value: any;
  required?: boolean;
  error?: string;
  onChange: (value: any) => void;
};

export function NodeConfigField({ field, schema, value, required, error, onChange }: NodeConfigFieldProps) {
  const label = schema.title ?? field;
  const description = schema.description;
  const hasEnum = Array.isArray(schema.enum);

  const commonLabel = (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span className="small" style={{ fontWeight: 700 }}>
        {label}
        {required ? " *" : ""}
      </span>
      {description ? <span className="small" style={{ color: "var(--muted)" }}>{description}</span> : null}
    </div>
  );

  if (schema.type === "boolean") {
    return (
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {commonLabel}
        {error ? (
          <span className="small" style={{ color: "#ef4444" }}>
            {error}
          </span>
        ) : null}
      </label>
    );
  }

  if (hasEnum) {
    return (
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {commonLabel}
        <select className="select" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="" disabled>
            Select…
          </option>
          {(schema.enum ?? []).map((opt) => (
            <option key={String(opt)} value={opt}>
              {String(opt)}
            </option>
          ))}
        </select>
        {error ? (
          <span className="small" style={{ color: "#ef4444" }}>
            {error}
          </span>
        ) : null}
      </label>
    );
  }

  const inputType = schema.type === "number" || schema.type === "integer" ? "number" : "text";

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {commonLabel}
      <input
        className="input"
        type={inputType}
        step={schema.type === "integer" ? 1 : undefined}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <span className="small" style={{ color: "#ef4444" }}>
          {error}
        </span>
      ) : null}
    </label>
  );
}
