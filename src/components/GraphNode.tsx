import React from "react";
import { Handle, Position } from "reactflow";
import { PinKind, type PinDefinition } from "../lib/graphIR/types";

export type GraphNodeProps = {
  data: {
    label: string;
    category: string;
    pins: PinDefinition[];
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
  if (pin.direction === "IN") return Position.Left;
  return Position.Right;
}

export function GraphNode({ data, selected }: GraphNodeProps) {
  const grouped: Record<string, PinDefinition[]> = {};
  (data.pins ?? []).forEach((p) => {
    const group = p.group ?? "Pins";
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(p);
  });

  return (
    <div className="node" style={{ borderColor: selected ? "rgba(99,179,255,.6)" : undefined, minWidth: 240 }}>
      <div className="nodeH">
        <div>
          <div className="nodeT">{data.label}</div>
          <div className="nodeS">{data.category}</div>
        </div>
      </div>
      <div className="nodeB" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Object.entries(grouped).map(([group, pins]) => (
          <div key={group} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div className="small" style={{ fontWeight: 700 }}>
              {group}
            </div>
            {pins.map((pin) => {
              const color = pin.kind === PinKind.CONTROL ? pinColor.CONTROL : pinColor[pin.dataType ?? "json"] ?? "#6b7280";
              return (
                <div key={pin.id} style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
                  {pin.direction === "IN" ? null : (
                    <Handle
                      type="source"
                      position={handlePosition(pin)}
                      id={pin.id}
                      style={{ background: color, width: pin.kind === PinKind.CONTROL ? 12 : 10, height: pin.kind === PinKind.CONTROL ? 12 : 10 }}
                    />
                  )}
                  <div className="small" style={{ flex: 1 }}>
                    {pin.label}
                    {pin.dataType ? <span style={{ marginLeft: 6, color: "#9ca3af" }}>({pin.dataType})</span> : null}
                    {pin.required ? <span style={{ marginLeft: 6, color: "#ef4444" }}>*</span> : null}
                  </div>
                  {pin.direction === "IN" ? (
                    <Handle
                      type="target"
                      position={handlePosition(pin)}
                      id={pin.id}
                      style={{ background: color, width: pin.kind === PinKind.CONTROL ? 12 : 10, height: pin.kind === PinKind.CONTROL ? 12 : 10 }}
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
