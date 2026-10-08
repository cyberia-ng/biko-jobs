import { useContext, type ReactNode } from "react";
import type { Navigate } from "./local-state.ts";
import { AppContext } from "./context.ts";

export function Nav() {
  const { localState, dispatchLocal, withLoading, store } = useContext(AppContext);
  function navigate(screen: Navigate["screen"]) {
    dispatchLocal({ type: "navigate", screen });
  }
  return (
    <div className="h-100">
      <div className="shadow h-100 bg-dark nav nav-pills d-flex flex-row flex-sm-column">
        <NavItem active={localState.screen.type === "kanban"} onClick={() => navigate("kanban")}>
          <i className="bi bi-layout-three-columns fs-1" />
        </NavItem>
        <NavItem active={localState.screen.type === "new job"} onClick={() => navigate("new job")}>
          <i className="bi bi-plus-circle fs-1" />
        </NavItem>
        <div className="flex-grow-1"></div>
        {localState.loading && (
          <NavItem end>
            <div className="spinner-border" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </NavItem>
        )}
        <NavItem end onClick={withLoading(() => store?.refreshState())}>
          <i className="bi bi-arrow-clockwise fs-1" />
        </NavItem>
      </div>
    </div>
  );
}

function NavItem(props: {
  active?: boolean;
  end?: boolean;
  children?: ReactNode | ReactNode[];
  onClick?: () => void;
}) {
  return (
    <div className={"nav-item " + ((props?.end ?? false) ? "border-top" : "border-bottom")}>
      <a
        className={"nav-link" + ((props.active ?? false) ? " active rounded-0" : "")}
        href="#"
        onClick={(e) => {
          e.preventDefault();
          props.onClick?.();
        }}
      >
        {props.children}
      </a>
    </div>
  );
}
