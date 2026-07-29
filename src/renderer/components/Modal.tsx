import { X } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';

interface ModalProps {
  title: string;
  description?: string;
  confirmLabel: string;
  open: boolean;
  canConfirm?: boolean;
  children: ReactNode;
  onClose(): void;
  onConfirm(): void;
}

export function Modal({
  title,
  description,
  confirmLabel,
  open,
  canConfirm = true,
  children,
  onClose,
  onConfirm,
}: ModalProps) {
  if (!open) {
    return null;
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canConfirm) {
      onConfirm();
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="modal-card"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="icon-button modal-close"
          aria-label="Закрыть"
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <div className="modal-heading">
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <div className="modal-content">{children}</div>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Отмена
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={!canConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
