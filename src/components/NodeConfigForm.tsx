import React, { useMemo } from "react";
import { NodeConfigField } from "./NodeConfigFields";
import {
  type ConfigSchema,
  type ConfigPropertySchema,
  coerceConfigValue,
  mergeConfigDefaults,
  requiredFieldSet,
  validateConfigField
} from "../lib/nodes/configSchema";

export type NodeConfigFormProps = {
  nodeId: string;
  nodeType: string;
  config: Record<string, any>;
  schema: ConfigSchema;
  onChange: (next: Record<string, any>) => void;
  onPatch?: (patch: Record<string, any>) => void;
  errors?: Record<string, string>;
};

export function NodeConfigForm({ nodeId, nodeType, config, schema, onChange, onPatch, errors }: NodeConfigFormProps) {
  const props = schema?.properties ?? {};
  const required = useMemo(() => requiredFieldSet(schema), [schema?.required]);
  const merged = useMemo(() => mergeConfigDefaults(schema, config ?? {}), [config, schema]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Object.entries(props).map(([field, prop]) => {
        const value = merged[field];
        const requiredField = required.has(field);
        const error = errors?.[field] ?? validateConfigField(value, prop, requiredField);

        const handleChange = (raw: any) => {
          const nextVal = coerceConfigValue(raw, prop);
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
