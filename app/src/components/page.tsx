import type { PropsWithChildren } from "react";

export function Page({ children }: PropsWithChildren<{}>) {
  return (
    <div className="container-lg p-0">
      <div className="bg-white m-2 p-2 rounded shadow-sm fs-4">{children}</div>
    </div>
  );
}
