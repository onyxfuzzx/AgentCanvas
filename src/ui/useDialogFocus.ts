import { useEffect, useRef } from 'react';

export const focusableSelector =
  'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])';

/** Trap keyboard focus in a mounted modal, then return to the invoking control. */
export function useDialogFocus<T extends HTMLElement>(onEscape?: () => void) {
  const ref = useRef<T>(null);
  const dismiss = useRef(onEscape);
  const invoker = useRef(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  dismiss.current = onEscape;
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const previous = invoker.current;
    const isTop = () =>
      Array.from(document.querySelectorAll('[aria-modal="true"]')).at(-1) ===
      root;
    const elements = () =>
      Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (e) => e.getClientRects().length && !e.closest('[inert]'),
      );
    const focus = () => {
      if (!isTop()) return;
      if (!root.contains(document.activeElement))
        (
          root.querySelector<HTMLElement>('[autofocus]') ??
          elements()[0] ??
          root
        ).focus();
    };
    focus();
    const keydown = (e: KeyboardEvent) => {
      if (!isTop()) return;
      if (e.key === 'Escape' && dismiss.current) {
        e.preventDefault();
        e.stopPropagation();
        dismiss.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = elements(),
        first = list[0],
        last = list.at(-1);
      if (!first) {
        e.preventDefault();
        root.focus();
        return;
      }
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === root ||
          !root.contains(document.activeElement))
      ) {
        e.preventDefault();
        last?.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last ||
          !root.contains(document.activeElement))
      ) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', focus);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', focus);
      if (previous?.isConnected && !previous.closest('[inert]'))
        previous.focus();
    };
  }, []);
  return ref;
}
