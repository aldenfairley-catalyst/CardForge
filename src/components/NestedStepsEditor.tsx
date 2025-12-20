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
      return { type: "OPEN_REACTION_WINDOW", timing: "BEFORE_DAMAGE", windowId: "pre_damage" };
    case "DEAL_DAMAGE":
      return { type: "DEAL_DAMAGE", target: { type: "TARGET" }, amountExpr: { type: "CONST_NUMBER", value: 10 }, damageType: "PHYSICAL" as any } as any;
    case "HEAL":
      return { type: "HEAL", target: { type: "SELF" }, amountExpr: { type: "CONST_NUMBER", value: 10 } } as any;
    case "SET_VARIABLE":
      return { type: "SET_VARIABLE", saveAs: "var", valueExpr: { type: "CONST_NUMBER", value: 1 } } as any;
    case "APPLY_STATUS":
      return { type: "APPLY_STATUS",
