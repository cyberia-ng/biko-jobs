import type { ReactNode } from "react";
import type { LocalState } from "./local-state.ts";

export function Nav(props: {
  localState: LocalState;
  refresh: () => void;
  navigate: (screen: LocalState["screen"]) => void;
}) {
  return (
    <div className="h-100">
      <div className="shadow h-100 bg-dark nav nav-pills d-flex flex-row flex-sm-column">
        <NavItem
          active={props.localState.screen === "kanban"}
          onClick={() => props.navigate("kanban")}
        >
          <i className="bi bi-layout-three-columns fs-1" />
        </NavItem>
        <NavItem
          active={props.localState.screen === "new job"}
          onClick={() => props.navigate("new job")}
        >
          <i className="bi bi-plus-circle fs-1" />
        </NavItem>
        <div className="flex-grow-1"></div>
        {props.localState.loading && (
          <NavItem end>
            <div className="spinner-border" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </NavItem>
        )}
        <NavItem end onClick={props.refresh}>
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
