import React, { useMemo } from "react";
import { NodeConfigField, type ConfigPropertySchema } from "./NodeConfigFields";

type ConfigSchema = {
  type?: string;
  title?: string;
  description?: string;
  properties?: Record<string, ConfigPropertySchema>;
  required?: string[];
};

export type NodeConfigFormProps = {
  nodeId: string;
  nodeType: string;
  config: Record<string, any>;
  schema: ConfigSchema;
  onChange: (next: Record<string, any>) => void;
  onPatch?: (patch: Record<string, any>) => void;
  errors?: Record<string, string>;
};

function mergeDefaults(schema: ConfigSchema, config: Record<string, any>) {
  const defaults: Record<string, any> = {};
  Object.entries(schema?.properties ?? {}).forEach(([key, prop]) => {
    if (prop && Object.prototype.hasOwnProperty.call(prop, "default")) defaults[key] = (prop as any).default;
  });
  return { ...defaults, ...(config ?? {}) };
}

function coerceValue(value: any, prop: ConfigPropertySchema) {
  const isEmpty = typeof value === "string" && value.trim() === "";

  if (prop.enum && Array.isArray(prop.enum)) {
    return value;
  }
  if (prop.type === "boolean") return Boolean(value);
  if (prop.type === "integer") {
    if (isEmpty) return prop.default ?? undefined;
    const parsed = Math.floor(Number(value));
    const min = Number.isFinite(prop.minimum) ? Number(prop.minimum) : undefined;
    const max = Number.isFinite(prop.maximum) ? Number(prop.maximum) : undefined;
    const clamped = Number.isFinite(parsed) ? parsed : 0;
    if (min != null && clamped < min) return min;
    if (max != null && clamped > max) return max;
    return clamped;
  }
  if (prop.type === "number") {
    if (isEmpty) return prop.default ?? undefined;
    const parsed = Number(value);
    const min = Number.isFinite(prop.minimum) ? Number(prop.minimum) : undefined;
    const max = Number.isFinite(prop.maximum) ? Number(prop.maximum) : undefined;
    if (!Number.isFinite(parsed)) return prop.default ?? 0;
    if (min != null && parsed < min) return min;
    if (max != null && parsed > max) return max;
    return parsed;
  }
  return value;
}

function validateField(value: any, prop: ConfigPropertySchema, required: boolean): string | null {
  if (required && (value === null || value === undefined || value === "")) return "Required";
  if ((prop.type === "number" || prop.type === "integer") && typeof value === "number") {
    if (prop.minimum != null && value < prop.minimum) return `Min ${prop.minimum}`;
    if (prop.maximum != null && value > prop.maximum) return `Max ${prop.maximum}`;
  }
  return null;
}

export function NodeConfigForm({ nodeId, nodeType, config, schema, onChange, onPatch, errors }: NodeConfigFormProps) {
  const props = schema?.properties ?? {};
  const required = useMemo(() => new Set(schema?.required ?? []), [schema?.required]);
  const merged = useMemo(() => mergeDefaults(schema, config ?? {}), [config, schema]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Object.entries(props).map(([field, prop]) => {
        const value = merged[field];
        const requiredField = required.has(field);
        const error = errors?.[field] ?? validateField(value, prop, requiredField);

        const handleChange = (raw: any) => {
          const nextVal = coerceValue(raw, prop);
          const nextConfig = { ...merged, [field]: nextVal };
          onChange(nextConfig);
          onPatch?.({ [field]: nextVal });
        };

        return (
          <NodeConfigField
            key={`${nodeId}-${nodeType}-${field}`}
            field={field}
            schema={prop}
            value={value}
            required={requiredField}
            error={error ?? undefined}
            onChange={handleChange}
          />
        );
      })}

      {!Object.keys(props).length ? <div className="small">No configurable properties.</div> : null}
    </div>
  );
}
