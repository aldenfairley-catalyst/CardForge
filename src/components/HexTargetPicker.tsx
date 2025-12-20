import React, { useMemo } from "react";

type Axial = { q: number; r: number };

export type HexPickerState = {
  viewRadius: number; // how many hexes from center to render
  mode: "TARGET" | "BARRIER";
  target?: Axial;
  barriers: Record<string, true>; // key = "q,r"
};

function keyOf(a: Axial) {
  return `${a.q},${a.r}`;
}

function axialDistance(a: Axial, b: Axial) {
  // axial distance using cube coords
  const x1 = a.q;
  const z1 = a.r;
  const y1 = -x1 - z1;

  const x2 = b.q;
  const z2 = b.r;
  const y2 = -x2 - z2;

  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
}

type Cube = { x: number; y: number; z: number };
function axialToCube(a: Axial): Cube {
  const x = a.q;
  const z = a.r;
  const y = -x - z;
  return { x, y, z };
}
function cubeToAxial(c: Cube): Axial {
  return { q: c.x, r: c.z };
}
function cubeLerp(a: Cube, b: Cube, t: number): Cube {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t
  };
}
function cubeRound(c: Cube): Cube {
  let rx = Math.round(c.x);
  let ry = Math.round(c.y);
  let rz = Math.round(c.z);

  const x_diff = Math.abs(rx - c.x);
  const y_diff = Math.abs(ry - c.y);
  const z_diff = Math.abs(rz - c.z);

  if (x_diff > y_diff && x_diff > z_diff) rx = -ry - rz;
  else if (y_diff > z_diff) ry = -rx - rz;
  else rz = -rx - ry;

  return { x: rx, y: ry, z: rz };
}

function hexLine(a: Axial, b: Axial): Axial[] {
  const N = axialDistance(a, b);
  const ac = axialToCube(a);
  const bc = axialToCube(b);
  const out: Axial[] = [];
  for (let i = 0; i <= N; i++) {
    const t = N === 0 ? 0 : i / N;
    out.push(cubeToAxial(cubeRound(cubeLerp(ac, bc, t))));
  }
  return out;
}

function isLineBlocked(a: Axial, b: Axial, barriers: Record<string, true>) {
  const line = hexLine(a, b);
  // exclude endpoints
  for (let i = 1; i < line.length - 1; i++) {
    if (barriers[keyOf(line[i])]) return true;
  }
  // if target itself is a barrier, treat as blocked too
  if (barriers[keyOf(b)]) return true;
  return false;
}

function axialToPixel(a: Axial, size: number) {
  // pointy-top hex axial -> pixel
  const x = size * Math.sqrt(3) * (a.q + a.r / 2);
  const y = size * (3 / 2) * a.r;
  return { x, y };
}

function hexPoints(cx: number, cy: number, size: number) {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30); // pointy-top
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(" ");
}

function defaultState(): HexPickerState {
  return {
    viewRadius: 12,
    mode: "TARGET",
    target: { q: 0, r: 0 },
    barriers: {}
  };
}

export default function HexTargetPicker(props: {
  minRange: number;
  maxRange: number;
  aoeRadius: number; // 0 => no AoE preview
  includeCenter: boolean;
  lineOfSight: boolean;
  value?: HexPickerState;
  onChange: (next: HexPickerState) => void;
}) {
  const state = props.value ?? defaultState();
  const origin: Axial = { q: 0, r: 0 };

  const minR = Math.max(0, Math.floor(props.minRange || 0));
  const maxR = Math.max(0, Math.floor(props.maxRange || 0));
  const aoeR = Math.max(0, Math.floor(props.aoeRadius || 0));

  const size = 14; // hex pixel radius
  const padding = 30;

  const hexes = useMemo(() => {
    const R = Math.max(2, Math.min(40, Math.floor(state.viewRadius || 12)));
    const out: Axial[] = [];
    for (let q = -R; q <= R; q++) {
      const r1 = Math.max(-R, -q - R);
      const r2 = Math.min(R, -q + R);
      for (let r = r1; r <= r2; r++) out.push({ q, r });
    }
    return out;
  }, [state.viewRadius]);

  // compute bounds for SVG viewBox
  const bounds = useMemo(() => {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;

    for (const h of hexes) {
      const p = axialToPixel(h, size);
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    return {
      width: (maxX - minX) + padding * 2 + size * 2,
      height: (maxY - minY) + padding * 2 + size * 2,
      offsetX: -minX + padding + size,
      offsetY: -minY + padding + size
    };
  }, [hexes]);

  const target = state.target;

  // targetable set
  const targetable = useMemo(() => {
    const set = new Set<string>();
    for (const h of hexes) {
      const d = axialDistance(origin, h);
      if (d < minR || d > maxR) continue;

      if (props.lineOfSight) {
        if (isLineBlocked(origin, h, state.barriers)) continue;
      }

      set.add(keyOf(h));
    }
    return set;
  }, [hexes, minR, maxR, props.lineOfSight, state.barriers]);

  // AoE affected set (based on target)
  const affected = useMemo(() => {
    const set = new Set<string>();
    if (!target || aoeR <= 0) return set;

    for (const h of hexes) {
      const d = axialDistance(target, h);
      if (d > aoeR) continue;
      if (!props.includeCenter && d === 0) continue;

      if (props.lineOfSight) {
        // barrier blocks from impact center -> affected cell
        if (isLineBlocked(target, h, state.barriers)) continue;
      }

      set.add(keyOf(h));
    }
    return set;
  }, [hexes, target, aoeR, props.includeCenter, props.lineOfSight, state.barriers]);

  function setState(patch: Partial<HexPickerState>) {
    props.onChange({ ...state, ...patch });
  }

  function toggleBarrier(h: Axial) {
    const k = keyOf(h);
    const barriers = { ...state.barriers };
    if (barriers[k]) delete barriers[k];
    else barriers[k] = true;
    setState({ barriers });
  }

  function clickHex(h: Axial) {
    if (state.mode === "BARRIER") return toggleBarrier(h);

    // mode TARGET
    const infoKey = keyOf(h);
    if (!targetable.has(infoKey)) {
      // allow selecting out-of-range to inspect? keep strict for now:
      return;
    }
    setState({ target: h });
  }

  const modeLabel = state.mode === "TARGET" ? "Target Select" : "Barrier Paint";

  return (
    <div className="panel" style={{ marginTop: 10 }}>
      <div className="ph">
        <div>
          <div className="h2">Hex Range Preview</div>
          <div className="small">
            {modeLabel} • Range {minR}-{maxR}
            {aoeR > 0 ? ` • AoE ${aoeR}` : ""}
            {props.lineOfSight ? " • LoS ON" : " • LoS OFF"}
          </div>
        </div>
        <span className="badge">{hexes.length} hexes</span>
      </div>

      <div className="pb">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn" onClick={() => setState({ mode: state.mode === "TARGET" ? "BARRIER" : "TARGET" })}>
            Mode: {state.mode}
          </button>
          <button className="btn" onClick={() => setState({ barriers: {} })}>
            Clear Barriers
          </button>
          <button className="btn" onClick={() => setState({ target: { q: 0, r: 0 } })}>
            Reset Target
          </button>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="small">View Radius</span>
            <input
              className="input"
              type="number"
              value={state.viewRadius}
              onChange={(e) => setState({ viewRadius: Math.max(2, Math.min(40, Math.floor(Number(e.target.value) || 12))) })}
              style={{ width: 90 }}
            />
          </div>

          {target ? (
            <div className="small" style={{ marginLeft: "auto" }}>
              Target: ({target.q},{target.r})
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 10, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <svg
            width="100%"
            height={Math.min(520, bounds.height)}
            viewBox={`0 0 ${bounds.width} ${bounds.height}`}
            style={{ display: "block", background: "rgba(255,255,255,0.02)" }}
          >
            <g transform={`translate(${bounds.offsetX}, ${bounds.offsetY})`}>
              {/* draw hexes */}
              {hexes.map((h) => {
                const p = axialToPixel(h, size);
                const k = keyOf(h);

                const isOrigin = h.q === 0 && h.r === 0;
                const isBarrier = !!state.barriers[k];
                const isTarget = !!target && target.q === h.q && target.r === h.r;

                const canTarget = targetable.has(k);
                const isAffected = affected.has(k);

                // priority coloring
                let fill = "rgba(255,255,255,0.02)";
                let stroke = "rgba(255,255,255,0.10)";
                let strokeW = 1;

                if (canTarget) fill = "rgba(34,197,94,0.14)"; // green
                if (isAffected) fill = "rgba(239,68,68,0.18)"; // red
                if (isTarget) fill = "rgba(250,204,21,0.20)"; // yellow
                if (isBarrier) fill = "rgba(148,163,184,0.22)"; // slate

                if (isOrigin) {
                  stroke = "rgba(99,179,255,0.70)";
                  strokeW = 2;
                } else if (isTarget) {
                  stroke = "rgba(250,204,21,0.90)";
                  strokeW = 2;
                } else if (isBarrier) {
                  stroke = "rgba(148,163,184,0.80)";
                  strokeW = 2;
                }

                const pts = hexPoints(p.x, p.y, size - 1);

                return (
                  <polygon
                    key={k}
                    points={pts}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeW}
                    onClick={() => clickHex(h)}
                    style={{ cursor: state.mode === "BARRIER" ? "crosshair" : canTarget ? "pointer" : "not-allowed" }}
                  />
                );
              })}
            </g>
          </svg>
        </div>

        <div className="small" style={{ marginTop: 8 }}>
          Tips: Green = targetable. Red = AoE affected. Grey = barrier. Yellow = selected target. Blue outline = source.
        </div>
      </div>
    </div>
  );
}

