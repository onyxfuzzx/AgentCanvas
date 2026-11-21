export type Point = { x: number; y: number };
export type Viewport = Point & { zoom: number };
export type Shell = 'powershell' | 'cmd' | 'wsl' | 'git-bash';
export type AgentProvider = 'codex' | 'antigravity' | 'claude';
export type AgentSettings = {
  provider: AgentProvider;
  profileName: string;
  roleName: string;
  instructions: string;
  executable?: string;
};
export type Connection = {
  id: string;
  source: string;
  target: string;
  kind: 'agent' | 'memory';
  policy: 'approval' | 'auto';
};
export type CanvasNode = Point & {
  id: string;
  kind: 'card' | 'terminal' | 'note' | 'shape' | 'browser';
  title: string;
  color: string;
  width: number;
  height: number;
  z: number;
  shell?: Shell;
  agent?: AgentSettings;
  cwd?: string;
  areaId?: string;
  relativePath?: string;
  shape?: Shape;
  url?: string;
};
export type ShapeKind =
  'rectangle' | 'ellipse' | 'text' | 'arrow' | 'connector' | 'freehand';
export type Shape = {
  kind: ShapeKind;
  text?: string;
  points?: Point[];
  source?: string;
  target?: string;
};
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
export const GRID = 24;
export const toWorld = (p: Point, v: Viewport): Point => ({
  x: (p.x - v.x) / v.zoom,
  y: (p.y - v.y) / v.zoom,
});
export function zoomAt(v: Viewport, p: Point, factor: number): Viewport {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor));
  const world = toWorld(p, v);
  return { x: p.x - world.x * zoom, y: p.y - world.y * zoom, zoom };
}
export const snap = (n: number, enabled: boolean) =>
  enabled ? Math.round(n / GRID) * GRID : n;
export function intersects(
  a: Point & { width: number; height: number },
  b: Point & { width: number; height: number },
) {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  );
}
export function nearViewport(n: CanvasNode, v: Viewport, w: number, h: number) {
  return intersects(n, {
    x: (-v.x - 240) / v.zoom,
    y: (-v.y - 240) / v.zoom,
    width: (w + 480) / v.zoom,
    height: (h + 480) / v.zoom,
  });
}
export type CanvasInsets = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};
export function fitViewport(
  nodes: CanvasNode[],
  width: number,
  height: number,
  insets: CanvasInsets = { left: 0, right: 0, top: 0, bottom: 0 },
): Viewport {
  width = Math.max(1, width - insets.left - insets.right);
  height = Math.max(1, height - insets.top - insets.bottom);
  if (!nodes.length)
    return { x: insets.left + 80, y: insets.top + 80, zoom: 1 };
  const left = Math.min(...nodes.map((n) => n.x));
  const top = Math.min(...nodes.map((n) => n.y));
  const right = Math.max(...nodes.map((n) => n.x + n.width));
  const bottom = Math.max(...nodes.map((n) => n.y + n.height));
  const zoom = Math.max(
    MIN_ZOOM,
    Math.min(
      1,
      (width - 120) / (right - left),
      (height - 120) / (bottom - top),
    ),
  );
  return {
    x: insets.left + (width - (right - left) * zoom) / 2 - left * zoom,
    y: insets.top + (height - (bottom - top) * zoom) / 2 - top * zoom,
    zoom,
  };
}
