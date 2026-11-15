import type { CanvasInsets } from '../canvas/model';

type Bounds = { left: number; top: number; right: number; bottom: number };

/** Measured client pixels only; world geometry is never changed by panel layout. */
export function panelInsets(
  viewport: Bounds,
  sidebar?: Bounds,
  inspector?: Bounds,
): CanvasInsets {
  const width = viewport.right - viewport.left;
  const height = viewport.bottom - viewport.top;
  const clamp = (value: number, limit: number) =>
    Math.max(0, Math.min(value, limit));
  return {
    left: sidebar ? clamp(sidebar.right - viewport.left + 10, width) : 0,
    right:
      inspector && width > 900
        ? clamp(viewport.right - inspector.left + 6, width)
        : 0,
    top: Math.min(100, height),
    bottom:
      inspector && width <= 900
        ? clamp(viewport.bottom - inspector.top + 6, height)
        : Math.min(width <= 760 ? 116 : 70, height),
  };
}
