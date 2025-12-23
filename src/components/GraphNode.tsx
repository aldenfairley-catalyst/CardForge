import React, { useMemo } from "react";
import { Handle, Position } from "reactflow";
import { PinKind, type PinDefinition } from "../lib/graphIR/types";
import { getNodeDef, materializePins } from "../lib/nodes/registry";

export type GraphNodeProps = {
  id: string;
  data: {
    nodeType: string;
    config: Record<string, any>;
  };
  selected?: boolean;
};

const pinColor: Record<string, string> = {
  CONTROL: "#6a5acd",
  number: "#f59e0b",
  string: "#10b981",
  boolean: "#3b82f6",
  json: "#111827"
};

function handlePosition(pin: PinDefinition) {
  switch (pin.position) {
    case "TOP":
      return Position.Top;
    case "BOTTOM":
      return Position.Bottom;
    case "LEFT":
      return Position.Left;
    case "RIGHT":
      return Position.Right;
    default:
      return pin.direction === "IN" ? Position.Left : Position.Right;
  }
}

function pinBadgeLabel(pin: PinDefinition) {
  if (pin.kind === PinKind.CONTROL) return "CONTROL";
  return pin.dataType ?? "any";
}

/**
 * Generic ReactFlow node renderer driven entirely by the node registry.
 *
 * Inputs (via ReactFlow node.data):
 * - `nodeType`: string key that must exist in `nodeRegistry.json`.
 * - `config`: config object for materializing dynamic pins (e.g., IF elseIfCount).
 *
 * Output:
 * - Renders grouped pin panels and ReactFlow Handles with stable ids matching the registry.
 * - Falls back to a visible error card when the node type is unknown to surface registry drift.
 */
export function GraphNode({ data, selected }: GraphNodeProps) {
  const nodeDef = useMemo(() => getNodeDef(data.nodeType), [data.nodeType]);
  const { pins, error } = useMemo(() => {
    if (!nodeDef) return { pins: [] as PinDefinition[], error: `Unknown nodeType: ${data.nodeType}` };
    try {
      return { pins: materializePins(data.nodeType, data.config ?? {}), error: null as string | null };
    } catch (e: any) {
      return { pins: [] as PinDefinition[], error: e?.message ?? String(e) };
    }
  }, [data.config, data.nodeType, nodeDef]);

  const grouped: Record<string, PinDefinition[]> = useMemo(() => {
    const bucket: Record<string, PinDefinition[]> = {};
    (pins ?? []).forEach((p) => {
      const group = p.group ?? "Pins";
      if (!bucket[group]) bucket[group] = [];
      bucket[group].push(p);
    });
    return bucket;
  }, [pins]);

  if (!nodeDef || error) {
    return (
      <div className="node" style={{ borderColor: "#ef4444", background: "rgba(239,68,68,0.08)", minWidth: 240 }}>
        <div className="nodeH">
          <div>
            <div className="nodeT" style={{ color: "#b91c1c" }}>
              {error ?? "Unknown node"}
            </div>
            <div className="nodeS">{data.nodeType}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="node" style={{ borderColor: selected ? "rgba(99,179,255,.6)" : undefined, minWidth: 240 }}>
      <div className="nodeH">
        <div>
          <div className="nodeT">{nodeDef.label}</div>
          <div className="nodeS">{nodeDef.category}</div>
        </div>
      </div>
      <div className="nodeB" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Object.entries(grouped).map(([group, groupPins]) => (
          <div key={group} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div className="small" style={{ fontWeight: 700 }}>
              {group}
            </div>
            {groupPins.map((pin) => {
              const color = pin.kind === PinKind.CONTROL ? pinColor.CONTROL : pinColor[pin.dataType ?? "json"] ?? "#6b7280";
              const size = pin.kind === PinKind.CONTROL ? 12 : 10;
              return (
                <div key={pin.id} style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
                  {pin.direction === "IN" ? null : (
                    <Handle
                      type="source"
                      position={handlePosition(pin)}
                      id={pin.id}
                      className={`handle--${pin.kind === PinKind.CONTROL ? "control" : "data"}`}
                      style={{ background: color, width: size, height: size }}
                    />
                  )}
                  <div className="small" style={{ flex: 1 }}>
                    <span className={`pinBadge pinBadge--${pin.kind === PinKind.CONTROL ? "control" : "data"}`} title={`${pin.kind} • ${pin.direction}`}>
                      {pinBadgeLabel(pin)}
                    </span>
                    <span style={{ marginLeft: 6 }}>{pin.label}</span>
                    {pin.dataType ? <span style={{ marginLeft: 6, color: "#9ca3af" }}>({pin.dataType})</span> : null}
                    {pin.required ? <span style={{ marginLeft: 6, color: "#ef4444" }}>*</span> : null}
                    {pin.multi ? <span style={{ marginLeft: 6, color: "#c084fc" }}>multi</span> : null}
                    {typeof pin.maxConnections === "number" ? (
                      <span style={{ marginLeft: 6, color: "#f59e0b" }}>max {pin.maxConnections}</span>
                    ) : null}
                  </div>
                  {pin.direction === "IN" ? (
                    <Handle
                      type="target"
                      position={handlePosition(pin)}
                      id={pin.id}
                      className={`handle--${pin.kind === PinKind.CONTROL ? "control" : "data"}`}
                      style={{ background: color, width: size, height: size }}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
