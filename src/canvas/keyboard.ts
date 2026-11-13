import { GRID, type CanvasNode } from './model';

/** Keyboard layout edits use world units, independently of canvas zoom. */
export function keyboardLayout(
  nodes: CanvasNode[],
  ids: string[],
  key: string,
  resize: boolean,
  coarse: boolean,
): Record<string, Partial<CanvasNode>> {
  const delta = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  }[key];
  if (!delta) return {};
  const step = coarse ? GRID : 1;
  return Object.fromEntries(
    nodes
      .filter((n) => ids.includes(n.id) && n.shape?.kind !== 'connector')
      .map((n) => [
        n.id,
        resize
          ? {
              width: Math.max(
                n.kind === 'shape' ? 24 : 320,
                Math.min(10000, n.width + delta[0] * step),
              ),
              height: Math.max(
                n.kind === 'shape' ? 24 : 200,
                Math.min(10000, n.height + delta[1] * step),
              ),
            }
          : {
              x: Math.max(-1e7, Math.min(1e7, n.x + delta[0] * step)),
              y: Math.max(-1e7, Math.min(1e7, n.y + delta[1] * step)),
            },
      ]),
  );
}
