declare module "react-katex" {
  import type { ReactNode } from "react";

  export function BlockMath(props: {
    math: string;
    children?: ReactNode;
    errorColor?: string;
    renderError?: (error: Error) => ReactNode;
  }): ReactNode;
}
