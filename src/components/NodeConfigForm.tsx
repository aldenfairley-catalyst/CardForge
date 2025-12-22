import React, { useMemo } from "react";
import { NodeConfigField } from "./NodeConfigFields";
import {
  type ConfigSchema,
  coerceConfigValue,
  mergeConfigDefaults,
  requiredFieldSet,
  validateConfigField
} from "../lib/nodes/configSchema";

export type NodeConfigFormProps = {
  nodeId: string;
  nodeType: string;
  config: Record<string, any>;
  schema: ConfigSchema | null | undefined;
  onChange: (next: Record<string, any>) => void;
  onPatch?: (patch: Record<string, any>) => void;
  errors?: Record<string, string>;
};

export function NodeConfigForm({ nodeId, nodeType, config, schema, onChange, onPatch, errors }: NodeConfigFormProps) {
  const isObjectSchema = schema?.type === "object" || !!schema?.properties;
  const properties = (isObjectSchema ? schema?.properties : undefined) ?? {};
  const required = useMemo(() => requiredFieldSet(schema ?? undefined), [schema]);
  const mergedConfig = useMemo(() => mergeConfigDefaults(schema ?? { type: "object", properties: {} }, config ?? {}), [config, schema]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Object.entries(properties).map(([field, prop]) => {
        const value = mergedConfig[field];
        const requiredField = required.has(field);
        const error = errors?.[field] ?? validateConfigField(value, prop, requiredField);

        const handleChange = (raw: any) => {
          const nextVal = coerceConfigValue(raw, prop);
          const nextConfig = { ...mergedConfig, [field]: nextVal };
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

      {!Object.keys(properties).length ? <div className="small">No configurable properties.</div> : null}
    </div>
  );
}
