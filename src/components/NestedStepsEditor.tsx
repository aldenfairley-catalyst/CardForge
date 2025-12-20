import React from "react";
import type { Step } from "../lib/types";
import { blockRegistry } from "../lib/registry";
import { ExpressionEditor } from "./ExpressionEditor";
import { ConditionEditor } from "./ConditionEditor";

function mkStep(stepType: string): Step {
  switch (stepType) {
    case "SHOW_TEXT":
      return { type: "SHOW_TEXT", text: "..." };
    case "ROLL_D6":
      return { type: "ROLL_D6", saveAs: "roll" };
    case "ROLL_D20":
      return { type: "ROLL_D20", saveAs: "roll" };
    case "OPEN_REACTION_WINDOW":
      return { type: "OPEN_REACTION_WINDOW", timing: "BEFORE_DAMAGE", windowId: "pre_damage" } as any;
    case "DEAL_DAMAGE":
      return {
        type: "DEAL_DAMAGE",
        target: { type: "TARGET" } as any,
        amountExpr: { type: "CONST_NUMBER", value: 10 } as any,
        damageType: "PHYSICAL" as any
      } as any;
    case "HEAL":
      return {
        type: "HEAL",
        target: { type: "SELF" } as any,
        amountExpr: { type: "CONST_NUMBER", value: 10 } as any
      } as any;
    case "SET_VARIABLE":
      return { type: "SET_VARIABLE", saveAs: "var", valueExpr: { type: "CONST_NUMBER", value: 1 } as any } as any;
    case "APPLY_STATUS":
      return { type: "APPLY_STATUS", target: { type: "TARGET" } as any, status: "SLOWED" as any, duration: { turns: 1 } } as any;
    case "REMOVE_STATUS":
      return { type: "REMOVE_STATUS", target: { type: "SELF" } as any, status: "STUNNED" as any } as any;
    case "MOVE_ENTITY":
      return { type: "MOVE_ENTITY", target: { type: "SELF" } as any, to: { mode: "TARGET_POSITION" }, maxTiles: 5 } as any;
    case "OPPONENT_SAVE":
      return {
        type: "OPPONENT_SAVE",
        stat: "SPEED",
        difficulty: 13,
        onFail: [{ type: "SHOW_TEXT", text: "Fail" }],
        onSuccess: [{ type: "SHOW_TEXT", text: "Success" }]
      } as any;
    case "IF_ELSE":
      return {
        type: "IF_ELSE",
        condition: { type: "ALWAYS" } as any,
        then: [{ type: "SHOW_TEXT", text: "Then" }],
        else: [{ type: "SHOW_TEXT", text: "Else" }]
      } as any;
    default:
      return { type: "UNKNOWN_STEP", raw: { type: stepType } } as any;
  }
}

function StepRowEditor(props: { step: Step; onChange: (step: Step) => void }) {
  const s: any = props.step;

  return (
    <div style={{ marginTop: 10 }}>
      {s.type === "SHOW_TEXT" ? (
        <>
          <div className="small">Text</div>
          <textarea className="textarea" value={s.text ?? ""} onChange={(e) => props.onChange({ ...s, text: e.target.value })} />
        </>
      ) : null}

      {s.type === "SET_VARIABLE" ? (
        <>
          <div className="small">saveAs</div>
          <input className="input" value={s.saveAs ?? ""} onChange={(e) => props.onChange({ ...s, saveAs: e.target.value })} />
          <div className="small" style={{ marginTop: 8 }}>
            valueExpr
          </div>
          <ExpressionEditor value={s.valueExpr} onChange={(valueExpr) => props.onChange({ ...s, valueExpr })} />
        </>
      ) : null}

      {s.type === "DEAL_DAMAGE" ? (
        <>
          <div className="small">Damage Type</div>
          <select className="select" value={s.damageType} onChange={(e) => props.onChange({ ...s, damageType: e.target.value })}>
            {(blockRegistry.keys.DamageType as string[]).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <div className="small" style={{ marginTop: 8 }}>
            Amount Expression
          </div>
          <ExpressionEditor value={s.amountExpr} onChange={(amountExpr) => props.onChange({ ...s, amountExpr })} />
          <div className="small" style={{ marginTop: 8 }}>
            Target is still advanced (edit via Raw Step JSON in App for now).
          </div>
        </>
      ) : null}

      {s.type === "HEAL" ? (
        <>
          <div className="small">Amount Expression</div>
          <ExpressionEditor value={s.amountExpr} onChange={(amountExpr) => props.onChange({ ...s, amountExpr })} />
          <div className="small" style={{ marginTop: 8 }}>
            Target is still advanced (edit via Raw Step JSON in App for now).
          </div>
        </>
      ) : null}

      {s.type === "APPLY_STATUS" ? (
        <>
          <div className="small">Status</div>
          <select className="select" value={s.status} onChange={(e) => props.onChange({ ...s, status: e.target.value })}>
            {(blockRegistry.keys.StatusKey as string[]).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <div className="small" style={{ marginTop: 8 }}>
            Duration (turns)
          </div>
          <input
            className="input"
            type="number"
            value={s.duration?.turns ?? 1}
            onChange={(e) => props.onChange({ ...s, duration: { turns: Math.max(1, Math.floor(Number(e.target.value) || 1)) } })}
          />
        </>
      ) : null}

      {s.type === "REMOVE_STATUS" ? (
        <>
          <div className="small">Status</div>
          <select className="select" value={s.status} onChange={(e) => props.onChange({ ...s, status: e.target.value })}>
            {(blockRegistry.keys.StatusKey as string[]).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </>
      ) : null}

      {s.type === "MOVE_ENTITY" ? (
        <>
          <div className="small">Max Tiles</div>
          <input
            className="input"
            type="number"
            value={s.maxTiles ?? 1}
            onChange={(e) => props.onChange({ ...s, maxTiles: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
          />
        </>
      ) : null}

      {s.type === "ROLL_D6" || s.type === "ROLL_D20" ? (
        <>
          <div className="small">saveAs</div>
          <input className="input" value={s.saveAs ?? ""} onChange={(e) => props.onChange({ ...s, saveAs: e.target.value || undefined })} />
        </>
      ) : null}

      {s.type === "OPEN_REACTION_WINDOW" ? (
        <>
          <div className="small">windowId</div>
          <input className="input" value={s.windowId ?? ""} onChange={(e) => props.onChange({ ...s, windowId: e.target.value })} />
          <div className="small" style={{ marginTop: 8 }}>
            timing
          </div>
          <div style={{ fontWeight: 800 }}>{s.timing}</div>
        </>
      ) : null}

      {s.type === "UNKNOWN_STEP" ? (
        <div className="err">
          <b>UNKNOWN_STEP</b>
          <div className="small">Not in the registry.</div>
        </div>
      ) : null}
    </div>
  );
}

export function StepListEditor(props: {
  title: string;
  steps: Step[];
  onChange: (steps: Step[]) => void;
}) {
  const { title, steps, onChange } = props;

  function setStep(i: number, nextStep: Step) {
    const next = steps.slice();
    next[i] = nextStep;
    onChange(next);
  }

  function del(i: number) {
    const next = steps.slice();
    next.splice(i, 1);
    onChange(next);
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = steps.slice();
    const tmp = next[i];
    next[i] = next[j];
    next[j] = tmp;
    onChange(next);
  }

  function add(stepType: string) {
    onChange([...steps, mkStep(stepType)]);
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div className="small" style={{ fontWeight: 900 }}>
        {title}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
        {(blockRegistry.steps.types as string[]).map((t) => (
          <button key={t} className="btn" onClick={() => add(t)} title={`Add ${t}`}>
            + {t}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
        {steps.map((s, i) => (
          <div key={i} className="item" style={{ cursor: "default" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ fontWeight: 900, flex: 1 }}>
                {i + 1}. {s.type}
              </div>
              <button className="btn" onClick={() => move(i, -1)} disabled={i === 0}>
                ↑
              </button>
              <button className="btn" onClick={() => move(i, +1)} disabled={i === steps.length - 1}>
                ↓
              </button>
              <button className="btn btnDanger" onClick={() => del(i)}>
                Delete
              </button>
            </div>

            {/* Nested editors */}
            {(s as any).type === "IF_ELSE" ? (
              <div style={{ marginTop: 10 }}>
                <div className="small">Condition</div>
                <ConditionEditor
                  value={(s as any).condition}
                  onChange={(condition) => setStep(i, { ...(s as any), condition })}
                />

                <StepListEditor
                  title="Then"
                  steps={(s as any).then ?? []}
                  onChange={(then) => setStep(i, { ...(s as any), then })}
                />

                <div style={{ marginTop: 10 }}>
                  <div className="small" style={{ fontWeight: 900 }}>
                    Else If
                  </div>
                  <button
                    className="btn"
                    style={{ marginTop: 6 }}
                    onClick={() => {
                      const elseIf = [ ...(((s as any).elseIf ?? []) as any[]) ];
                      elseIf.push({ condition: { type: "ALWAYS" }, then: [{ type: "SHOW_TEXT", text: "ElseIf" }] });
                      setStep(i, { ...(s as any), elseIf });
                    }}
                  >
                    + Add Else If
                  </button>

                  {(((s as any).elseIf ?? []) as any[]).map((b, bi) => (
                    <div key={bi} className="panel" style={{ marginTop: 10 }}>
                      <div className="ph">
                        <div className="h2">Else If #{bi + 1}</div>
                        <button
                          className="btn btnDanger"
                          onClick={() => {
                            const elseIf = [ ...(((s as any).elseIf ?? []) as any[]) ];
                            elseIf.splice(bi, 1);
                            setStep(i, { ...(s as any), elseIf: elseIf.length ? elseIf : undefined });
                          }}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="pb">
                        <div className="small">Condition</div>
                        <ConditionEditor
                          value={b.condition}
                          onChange={(condition) => {
                            const elseIf = [ ...(((s as any).elseIf ?? []) as any[]) ];
                            elseIf[bi] = { ...elseIf[bi], condition };
                            setStep(i, { ...(s as any), elseIf });
                          }}
                        />
                        <StepListEditor
                          title="Then"
                          steps={b.then ?? []}
                          onChange={(then) => {
                            const elseIf = [ ...(((s as any).elseIf ?? []) as any[]) ];
                            elseIf[bi] = { ...elseIf[bi], then };
                            setStep(i, { ...(s as any), elseIf });
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <StepListEditor
                  title="Else"
                  steps={(s as any).else ?? []}
                  onChange={(elseSteps) => setStep(i, { ...(s as any), else: elseSteps })}
                />
              </div>
            ) : null}

            {(s as any).type === "OPPONENT_SAVE" ? (
              <div style={{ marginTop: 10 }}>
                <div className="small">Stat</div>
                <input
                  className="input"
                  value={(s as any).stat ?? ""}
                  onChange={(e) => setStep(i, { ...(s as any), stat: e.target.value })}
                />

                <div className="small" style={{ marginTop: 8 }}>
                  Difficulty
                </div>
                <input
                  className="input"
                  type="number"
                  value={(s as any).difficulty ?? 10}
                  onChange={(e) =>
                    setStep(i, { ...(s as any), difficulty: Math.max(1, Math.floor(Number(e.target.value) || 10)) })
                  }
                />

                <StepListEditor
                  title="On Fail"
                  steps={(s as any).onFail ?? []}
                  onChange={(onFail) => setStep(i, { ...(s as any), onFail })}
                />
                <StepListEditor
                  title="On Success"
                  steps={(s as any).onSuccess ?? []}
                  onChange={(onSuccess) => setStep(i, { ...(s as any), onSuccess })}
                />
              </div>
            ) : null}

            {/* Default per-step editor for non-nested step types */}
            {(s as any).type !== "IF_ELSE" && (s as any).type !== "OPPONENT_SAVE" ? (
              <StepRowEditor step={s} onChange={(ns) => setStep(i, ns)} />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export default StepListEditor;
