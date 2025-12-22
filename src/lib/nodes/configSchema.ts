export type ConfigPropertySchema = {
  type?: "string" | "number" | "integer" | "boolean";
  title?: string;
  description?: string;
  default?: any;
  enum?: any[];
  minimum?: number;
  maximum?: number;
};

export type ConfigSchema = {
  type?: string;
  title?: string;
  description?: string;
  properties?: Record<string, ConfigPropertySchema>;
  required?: string[];
};

export function requiredFieldSet(schema?: ConfigSchema | null) {
  return new Set(schema?.required ?? []);
}

export function mergeConfigDefaults(schema: ConfigSchema, config: Record<string, any>) {
  const defaults: Record<string, any> = {};
  Object.entries(schema?.properties ?? {}).forEach(([key, prop]) => {
    if (prop && Object.prototype.hasOwnProperty.call(prop, "default")) defaults[key] = (prop as any).default;
  });
  return { ...defaults, ...(config ?? {}) };
}

export function coerceConfigValue(value: any, prop: ConfigPropertySchema) {
  const isEmpty = typeof value === "string" && value.trim() === "";

  if (prop.enum && Array.isArray(prop.enum)) return value;
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

export function validateConfigField(value: any, prop: ConfigPropertySchema, required: boolean): string | null {
  if (required && (value === null || value === undefined || value === "")) return "Required";
  if ((prop.type === "number" || prop.type === "integer") && typeof value === "number") {
    if (prop.minimum != null && value < prop.minimum) return `Min ${prop.minimum}`;
    if (prop.maximum != null && value > prop.maximum) return `Max ${prop.maximum}`;
  }
  return null;
}
