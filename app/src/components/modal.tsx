import { createContext, useContext, useRef, type PropsWithChildren } from "react";

type ModalProps = { onConfirm?: () => void; onDismiss?: () => void };
const ModalContext = createContext<ModalProps>(null as any);

export function Modal({ children, ...props }: PropsWithChildren<ModalProps>) {
  const modalRef = useRef<HTMLDivElement>(null);
  function handleClick(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    if (e.target === modalRef.current) {
      props.onDismiss?.();
    }
  }
  return (
    <ModalContext value={props}>
      <div className="modal-backdrop show"></div>
      <div className="modal show d-block" tabIndex={-1} onClick={handleClick} ref={modalRef}>
        <div className="modal-dialog">
          <div className="modal-content">{children}</div>
        </div>
      </div>
    </ModalContext>
  );
}
export function ModalHeader({ children }: PropsWithChildren<{}>) {
  return <div className="modal-header">{children}</div>;
}

export function ModalTitle({ children }: PropsWithChildren<{}>) {
  return <h5 className="modal-title">{children}</h5>;
}

export function ModalCloseButton() {
  const { onDismiss } = useContext(ModalContext);
  return (
    <button
      type="button"
      className="btn-close"
      aria-label="Close"
      onClick={() => onDismiss?.()}
    ></button>
  );
}

export function ModalBody({ children }: PropsWithChildren<{}>) {
  return <div className="modal-body">{children}</div>;
}

export function ModalFooter({ children }: PropsWithChildren<{}>) {
  return <div className="modal-footer">{children}</div>;
}

export function ModalDismissButton({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  const { onDismiss } = useContext(ModalContext);
  return (
    <button
      type="button"
      className={className ?? "btn btn-secondary"}
      onClick={() => onDismiss?.()}
    >
      {children}
    </button>
  );
}

export function ModalConfirmButton({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  const { onConfirm } = useContext(ModalContext);
  return (
    <button type="button" className={className ?? "btn btn-primary"} onClick={() => onConfirm?.()}>
      {children}
    </button>
  );
}
