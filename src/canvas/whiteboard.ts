import type { CanvasNode, Point, ShapeKind } from './model';

export function drawingNode(
  kind: Exclude<ShapeKind, 'connector'>,
  points: Point[],
  id: string,
  z: number,
): CanvasNode {
  const first = points[0];
  const last = points.at(-1)!;
  const stroke = kind === 'freehand' ? points : [first, last];
  const x = Math.min(...stroke.map((p) => p.x)) - 8;
  const y = Math.min(...stroke.map((p) => p.y)) - 8;
  const width = Math.min(
    10000,
    Math.max(24, Math.max(...stroke.map((p) => p.x)) - x + 8),
  );
  const height = Math.min(
    10000,
    Math.max(24, Math.max(...stroke.map((p) => p.y)) - y + 8),
  );
  return {
    id,
    kind: 'shape',
    title: kind[0].toUpperCase() + kind.slice(1),
    color: '#c9934b',
    x,
    y,
    width,
    height,
    z,
    shape: {
      kind,
      ...(kind === 'arrow' || kind === 'freehand'
        ? {
            points: stroke.map((p) => ({
              x: Math.max(0, Math.min(1, (p.x - x) / width)),
              y: Math.max(0, Math.min(1, (p.y - y) / height)),
            })),
          }
        : {}),
      ...(kind === 'text' ? { text: 'Your text' } : {}),
    },
  };
}
function border(node: CanvasNode, toward: Point): Point {
  const center = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  const dx = toward.x - center.x,
    dy = toward.y - center.y;
  const scale =
    1 /
    Math.max(
      Math.abs(dx) / (node.width / 2),
      Math.abs(dy) / (node.height / 2),
      1,
    );
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}
export function connectorBounds(
  node: CanvasNode,
  nodes: CanvasNode[],
): CanvasNode {
  if (node.shape?.kind !== 'connector') return node;
  const a = nodes.find((n) => n.id === node.shape!.source),
    b = nodes.find((n) => n.id === node.shape!.target);
  if (!a || !b) return node;
  const start = border(a, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
  const end = border(b, { x: a.x + a.width / 2, y: a.y + a.height / 2 });
  const drawing = drawingNode('arrow', [start, end], node.id, node.z);
  return {
    ...node,
    x: drawing.x,
    y: drawing.y,
    width: drawing.width,
    height: drawing.height,
    // Endpoints are derived, never saved as connector point payloads.
  };
}
export function connectorPoints(node: CanvasNode, nodes: CanvasNode[]) {
  const a = nodes.find((n) => n.id === node.shape?.source),
    b = nodes.find((n) => n.id === node.shape?.target);
  if (!a || !b) return [];
  return [
    border(a, { x: b.x + b.width / 2, y: b.y + b.height / 2 }),
    border(b, { x: a.x + a.width / 2, y: a.y + a.height / 2 }),
  ].map((p) => ({ x: p.x - node.x, y: p.y - node.y }));
}
export const reflow = (nodes: CanvasNode[]) =>
  nodes.map((n) => connectorBounds(n, nodes));
export function withoutNodes(nodes: CanvasNode[], ids: Set<string>) {
  return nodes.filter(
    (n) =>
      !ids.has(n.id) &&
      !(
        n.shape?.kind === 'connector' &&
        (ids.has(n.shape.source!) || ids.has(n.shape.target!))
      ),
  );
}
