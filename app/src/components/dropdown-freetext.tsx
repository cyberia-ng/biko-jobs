import { useEffect, useRef, useState } from "react";

export function DropdownFreeText(props: {
  select: string;
  options: string[];
  onSelect: (value: string) => void;
  disabled?: boolean | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const [freeText, setFreeText] = useState("");
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  function handleDismissClick(e: Event) {
    if (e.target === btnRef.current) return;
    for (
      let target: HTMLElement | null = e.target as HTMLElement;
      target !== null;
      target = target.parentElement
    ) {
      if (target === listRef.current) return;
    }
    setExpanded(false);
  }
  useEffect(() => {
    document.addEventListener("click", handleDismissClick);
    return () => document.removeEventListener("click", handleDismissClick);
  });
  return (
    <div className={`dropdown ${expanded ? "show" : ""}`}>
      <button
        type="button"
        ref={btnRef}
        className={"btn btn-secondary dropdown-toggle"}
        onClick={() => setExpanded(!expanded)}
        disabled={props.disabled}
      >
        {props.select}
      </button>
      <ul ref={listRef} className={`dropdown-menu ${expanded ? "show" : ""}`}>
        <li>
          <div className="dropdown-item">
            <div className="d-flex">
              <input
                type="text"
                className={"form-control rounded-end-0"}
                onChange={(e) => setFreeText(e.target.value)}
                disabled={props.disabled}
              />
              <button
                type="button"
                className={"btn btn-success rounded-start-0"}
                onClick={() => {
                  setExpanded(false);
                  props.onSelect(freeText);
                  setFreeText("");
                }}
                disabled={props.disabled}
              >
                <i className="bi bi-check" />
              </button>
            </div>
          </div>
        </li>
        {props.options.map((option) => (
          <li key={option}>
            <a
              className={"dropdown-item"}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                if (props.disabled) return;
                setExpanded(false);
                props.onSelect(option);
              }}
            >
              {option}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
