declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }

  interface Element extends Record<string, unknown> {}
  interface ElementClass {}
  interface ElementAttributesProperty {
    props: any;
  }
  interface ElementChildrenAttribute {
    children: any;
  }
}
