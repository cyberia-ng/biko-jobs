import { useContext } from "react";
import { AppContext } from "../../context.ts";

export function SessionList(props: {
  selectedSession: string;
  loadSession: (sessionId: string) => void;
}) {
  const { loginState, sessionsList } = useContext(AppContext);
  return (
    <div className="border-start border-top">
      <div
        className={
          "border-bottom p-2 d-flex" +
          (sessionsList.includes(props.selectedSession) ? "" : " bg-primary-subtle")
        }
        onClick={() => props.loadSession("")}
      >
        <div className="flex-grow-1">New session</div>
        <div>
          <i className="bi bi-chevron-right" />
        </div>
      </div>
      {sessionsList.toReversed().map((session) => (
        <div
          className={
            "border-bottom p-2 d-flex" +
            (props.selectedSession === session ? " bg-primary-subtle" : "")
          }
          key={session}
          onClick={() => props.loadSession(session)}
        >
          {loginState?.session === session && (
            <div>
              <i className="bi bi-link-45deg text-primary me-2" />
            </div>
          )}
          <div className="flex-grow-1">{session}</div>
          <div>
            <i className="bi bi-chevron-right" />
          </div>
        </div>
      ))}
    </div>
  );
}
