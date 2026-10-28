import type { JSX as ReactJSX } from "react";

// React 19 removed the global JSX namespace; the components keep `JSX.Element` as return type.
declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
  }
}
