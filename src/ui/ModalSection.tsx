import type { ReactNode } from 'react';
import { useDialogFocus } from './useDialogFocus';
export function ModalSection({
  titleId,
  className = 'dialog',
  onClose,
  children,
}: {
  titleId: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useDialogFocus<HTMLElement>(onClose);
  return (
    <section
      ref={ref}
      tabIndex={-1}
      className={className}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </section>
  );
}
