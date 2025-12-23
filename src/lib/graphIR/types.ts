import type { AbilityComponent, CardEntity, Condition, Expression, Step } from "../types";
import type { ForgeProjectSchemaVersion, GraphSchemaVersion } from "../versions";
import { GRAPH_SUPPORTED_VERSIONS } from "../versions";

// Editor-side Graph IR used by the React Flow canvas.
// This is distinct from the canonical runtime steps stored on the card.

export type GraphVersion = GraphSchemaVersion;
export const supportedGraphVersions: GraphVersion[] = GRAPH_SUPPORTED_VERSIONS;

export enum PinKind {
  CONTROL = "CONTROL",
  DATA = "DATA"
}

export type EdgeKind = "CONTROL" | "DATA";

export type DataType =
  | "number"
  | "string"
  | "boolean"
  | "any"
  | "tokenMap"
  | "entityRef"
  | "targetSet"
  | "position"
  | "damageType"
  | "statusKey"
  | "tokenKey"
  | "zoneKey"
  | "distanceMetric"
  | "json";

export type PinDirection = "IN" | "OUT";

export type PinDefinition = {
  id: string;
  label: string;
  group?: string;
  kind: PinKind;
  direction: PinDirection;
  dataType?: DataType | DataType[];
  required?: boolean;
  defaultValue?: any;
  multi?: boolean;
  maxConnections?: number;
  optional?: boolean;
  position?: "TOP" | "BOTTOM" | "LEFT" | "RIGHT";
};

export type DynamicPinTemplate =
  | {
      kind: "ELSEIF_PINS";
      sourceField: string;
      pinsPerIndex: Array<{
        idTemplate: string;
        labelTemplate: string;
        group?: string;
        kind: PinKind;
        direction: PinDirection;
        dataType?: DataType | DataType[];
        required?: boolean;
        multi?: boolean;
        maxConnections?: number;
        optional?: boolean;
        defaultValue?: any;
        position?: "TOP" | "BOTTOM" | "LEFT" | "RIGHT";
      }>;
    };

export type NodeDefinition = {
  nodeType: string;
  label: string;
  category: string;
  description?: string;
  configSchema: any;
  pins: {
    static: PinDefinition[];
    dynamic?: DynamicPinTemplate;
  };
  compile:
    | { kind: "SUBGRAPH_ENTRY" }
    | { kind: "CANONICAL_STEP"; stepType: string }
    | { kind: "CONDITION_EXPR"; exprType: string }
    | { kind: "VALUE_EXPR"; exprType: string }
    | { kind: "CONDITION_AST" }
    | { kind: "VALUE_AST" };
};

export type PinEndpoint = {
  nodeId: string;
  pinId: string;
};

export type GraphEdge = {
  id: string;
  edgeKind: EdgeKind;
  dataType?: DataType | DataType[];
  from: PinEndpoint;
  to: PinEndpoint;
  createdAt?: string;
};

export type GraphNode = {
  id: string;
  nodeType: string;
  position: { x: number; y: number };
  config: Record<string, any>;
  pinsCache?: string[];
};

export type Graph = {
  graphVersion: GraphVersion;
  id: string;
  label?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type GraphSourceMapEntry = {
  stepPath: string;
  nodeId: string;
};

export type ForgeProject = {
  schemaVersion: ForgeProjectSchemaVersion;
  projectVersion?: string;
  cardSchemaVersion?: CardEntity["schemaVersion"];
  card: CardEntity;
  graphs: Record<string, Graph>;
  ui?: Record<string, any>;
};

export type CompiledGraphResult = {
  steps: Step[];
  issues: Array<{ severity: "ERROR" | "WARN"; code: string; message: string; path?: string }>;
  conditions?: Record<string, Condition>;
  expressions?: Record<string, Expression>;
  sourceMap?: GraphSourceMapEntry[];
};
