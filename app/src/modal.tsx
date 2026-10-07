import { useRef, type ReactNode } from "react";

export function Modal(props: {
  onDismiss: () => void;
  onConfirm: () => void;
  title: ReactNode;
  body: ReactNode;
  closeText?: ReactNode;
  confirmText?: ReactNode;
  confirmBtnClass?: string;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  function handleClick(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    if (e.target === modalRef.current) {
      props.onDismiss();
    }
  }
  return (
    <>
      <div className="modal-backdrop show"></div>
      <div className="modal show d-block" tabIndex={-1} onClick={handleClick} ref={modalRef}>
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{props.title}</h5>
              <button
                type="button"
                className="btn-close"
                aria-label="Close"
                onClick={() => props.onDismiss()}
              ></button>
            </div>
            <div className="modal-body">
              <p>{props.body}</p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => props.onDismiss()}>
                {props.closeText ?? "Close"}
              </button>
              <button
                type="button"
                className={`btn ${props.confirmBtnClass ?? "btn-primary"}`}
                onClick={() => props.onConfirm()}
              >
                {props.confirmText ?? "Save changes"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
