import type { CanvasNode } from './model';
import { connectorPoints } from './whiteboard';
export function ShapeNode({
  node,
  nodes,
}: {
  node: CanvasNode;
  nodes: CanvasNode[];
}) {
  const shape = node.shape!;
  const points =
    shape.kind === 'connector'
      ? connectorPoints(node, nodes)
      : (shape.points ?? []).map((p) => ({
          x: p.x * node.width,
          y: p.y * node.height,
        }));
  return (
    <svg
      className="shape-art"
      aria-label={node.title}
      viewBox={`0 0 ${node.width} ${node.height}`}
      preserveAspectRatio="none"
      style={{ color: node.color }}
    >
      <defs>
        <marker
          id={`arrow-${node.id}`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path
            d="M 1 1 L 9 5 L 1 9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </marker>
      </defs>
      {shape.kind === 'rectangle' && (
        <rect
          x="4"
          y="4"
          width={node.width - 8}
          height={node.height - 8}
          rx="10"
        />
      )}
      {shape.kind === 'ellipse' && (
        <ellipse
          cx={node.width / 2}
          cy={node.height / 2}
          rx={node.width / 2 - 4}
          ry={node.height / 2 - 4}
        />
      )}
      {(shape.kind === 'arrow' ||
        shape.kind === 'connector' ||
        shape.kind === 'freehand') && (
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          markerEnd={
            shape.kind === 'freehand' ? undefined : `url(#arrow-${node.id})`
          }
        />
      )}
      {shape.kind === 'text' && (
        <foreignObject
          x="8"
          y="8"
          width={node.width - 16}
          height={node.height - 16}
        >
          <div className="shape-text">{shape.text}</div>
        </foreignObject>
      )}
    </svg>
  );
}
