declare module "react" {
  export as namespace React;

  export type ReactNode = any;
  export type PropsWithChildren<P> = P & { children?: ReactNode };
  export type SetStateAction<S> = S | ((prev: S) => S);
  export type Dispatch<A> = (value: A) => void;
  export type MutableRefObject<T> = { current: T };
  export type RefObject<T> = { current: T | null };
  export type ChangeEvent<T = any> = { target: T };
  export type KeyboardEvent = any;
  export type WheelEvent = any;
  export function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useEffect(effect: (...args: any[]) => any, deps?: any[]): void;
  export function useMemo<T>(factory: () => T, deps?: any[]): T;
  export function useRef<T>(initialValue: T): MutableRefObject<T>;
  export function useCallback<T extends (...args: any[]) => any>(fn: T, deps?: any[]): T;
  export const Fragment: any;
  export const StrictMode: any;
  const React: any;
  export = React;
  export default React;

  export namespace JSX {
    interface Element extends ReactNode {}
    interface ElementClass {
      render?: any;
    }
    interface ElementAttributesProperty {
      props: any;
    }
    interface ElementChildrenAttribute {
      children: any;
    }
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

declare module "react/jsx-runtime" {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare module "react-dom/client" {
  export function createRoot(container: any): { render(node: any): void };
}

declare module "reactflow" {
  const ReactFlow: any;
  export default ReactFlow;
  export const Background: any;
  export const Controls: any;
  export const ReactFlowProvider: any;
  export function useNodesState<T = any>(initialState: T[]): [T[], (updater: any) => void, (changes: any) => void];
  export function useEdgesState<T = any>(initialState: T[]): [T[], (updater: any) => void, (changes: any) => void];
  export const addEdge: any;
  export const applyEdgeChanges: any;
  export const applyNodeChanges: any;
  export type Node<Data = any> = {
    id: string;
    type?: string;
    data: Data;
    position: { x: number; y: number };
    selected?: boolean;
    style?: any;
  };
  export type Connection = any;
  export type Edge<Data = any> = any;
  export const Handle: any;
  export const Position: any;
  export const MiniMap: any;
  export const ControlButton: any;
}

declare module "uuid" {
  export function v4(): string;
}

declare module "*.json?url" {
  const url: string;
  export default url;
}

declare global {
  namespace React {
    type ReactNode = any;
    const StrictMode: any;
    namespace JSX {
      interface Element extends ReactNode {}
      interface ElementClass {
        render?: any;
      }
      interface ElementAttributesProperty {
        props: any;
      }
      interface ElementChildrenAttribute {
        children: any;
      }
      interface IntrinsicElements {
        [elemName: string]: any;
      }
    }
  }

  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}
