import { useContext, type ReactNode } from "react";
import { AppContext } from "../context.ts";
import { basicScreen, login } from "../navigation-state.ts";

export function Nav() {
  const { loginState, loading, navigationState, navigate, refresh } = useContext(AppContext);
  return (
    <div className="shadow top-0 position-sticky bg-dark nav nav-pills d-flex flex-row flex-sm-column custom-nav">
      <NavItem
        disabled={loginState?.login === undefined}
        active={navigationState.screen === "kanban"}
        onClick={() => navigate(basicScreen("kanban"))}
      >
        <i className="bi bi-layout-three-columns fs-1" />
      </NavItem>
      <NavItem
        disabled={loginState?.login === undefined}
        active={navigationState.screen === "new job"}
        onClick={() => navigate(basicScreen("new job"))}
      >
        <i className="bi bi-plus-circle fs-1" />
      </NavItem>
      <NavItem
        disabled={loginState?.login?.type !== "master key"}
        active={navigationState.screen === "archive"}
        onClick={() => navigate(basicScreen("archive"))}
      >
        <i className="bi bi-archive fs-1" />
      </NavItem>
      <NavItem
        disabled={loginState?.login === undefined}
        active={navigationState.screen === "export"}
        onClick={() => navigate(basicScreen("export"))}
      >
        <i className="bi bi-box-arrow-up-right fs-1" />
      </NavItem>
      <div className="flex-grow-1"></div>
      {loading && (
        <NavItem>
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </NavItem>
      )}
      <NavItem onClick={() => navigate(login(undefined))}>
        <i className="bi bi-key fs-1" />
      </NavItem>
      <NavItem onClick={() => refresh()}>
        <i className="bi bi-arrow-clockwise fs-1" />
      </NavItem>
    </div>
  );
}

function NavItem(props: {
  active?: boolean;
  disabled?: boolean;
  children?: ReactNode | ReactNode[];
  onClick?: () => void;
}) {
  return (
    <div className="nav-item">
      <a
        className={
          "nav-link" +
          ((props.active ?? false) ? " active rounded-0" : "") +
          ((props.disabled ?? false) ? " disabled" : "")
        }
        href="#"
        onClick={(e) => {
          e.preventDefault();
          if (!(props.disabled ?? false)) {
            props.onClick?.();
          }
        }}
      >
        {props.children}
      </a>
    </div>
  );
}
