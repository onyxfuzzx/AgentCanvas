import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  fitViewport,
  intersects,
  nearViewport,
  snap,
  toWorld,
  zoomAt,
  type CanvasNode,
  type Point,
  type ShapeKind,
} from './model';
import { useCanvas } from './store';
import { drawingNode, connectorBounds } from './whiteboard';
import { ShapeNode } from './ShapeNode';

type Gesture = {
  pointer: number;
  start: Point;
  latest: Point;
  mode: 'pan' | 'move' | 'resize' | 'select' | 'draw' | 'link';
  drawing?: Exclude<ShapeKind, 'connector'>;
  points?: Point[];
  nodes: CanvasNode[];
  origin: Point;
  ids: string[];
  additive: string[];
};
export function Canvas({
  renderNode,
  onClose,
  disabled = false,
}: {
  renderNode?: (node: CanvasNode, visible: boolean) => ReactNode;
  onClose: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const { nodes, selected, viewport, snapGrid, edges } = useCanvas();
  const [linkDraft, setLinkDraft] = useState<{
    source: Point;
    target: Point;
  } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef(0);
  const space = useRef(false);
  const [panning, setPanning] = useState(false);
  const [tool, setTool] = useState<'select' | ShapeKind>('select');
  const [source, setSource] = useState<string | null>(null);
  const [draft, setDraft] = useState<CanvasNode | null>(null);
  useEffect(() => {
    if (disabled) {
      gesture.current = null;
      setDraft(null);
      setTool('select');
      setSource(null);
      setLinkDraft(null);
    }
  }, [disabled]);
  const [size, setSize] = useState({ width: 1200, height: 800 });
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(root.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (disabled) return;
      const editable = (e.target as HTMLElement)?.closest(
        'input,textarea,select,.dialog,[contenteditable="true"],.terminal-host',
      );
      if (editable) return;
      if (e.code === 'Space') {
        e.preventDefault();
        space.current = true;
        setPanning(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) useCanvas.getState().redo();
        else useCanvas.getState().undo();
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        useCanvas.getState().redo();
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        useCanvas
          .getState()
          .select(useCanvas.getState().nodes.map((n) => n.id));
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        onClose(useCanvas.getState().selected);
      }
      if (e.key === 'Escape') {
        useCanvas.getState().select([]);
        setTool('select');
        setSource(null);
        setDraft(null);
        gesture.current = null;
        setLinkDraft(null);
      }
      if (e.key === 'Home') {
        e.preventDefault();
        useCanvas
          .getState()
          .setViewport(
            fitViewport(useCanvas.getState().nodes, size.width, size.height),
          );
      }
    };
    const release = () => {
      space.current = false;
      setPanning(false);
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.code === 'Space') release();
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', release);
    };
  }, [onClose, size, disabled]);
  useEffect(() => {
    const element = root.current!;
    const wheel = (e: WheelEvent) => {
      if (disabled) {
        e.preventDefault();
        return;
      }
      if (
        (e.target as HTMLElement).closest('.terminal-host,.note-body') &&
        !e.ctrlKey &&
        !e.metaKey
      )
        return;
      e.preventDefault();
      const rect = element.getBoundingClientRect();
      const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const s = useCanvas.getState();
      if (
        e.shiftKey ||
        (!e.ctrlKey &&
          (Math.abs(e.deltaX) > 0 ||
            (e.deltaMode === 0 && Math.abs(e.deltaY) < 40)))
      ) {
        s.setViewport({
          ...s.viewport,
          x: s.viewport.x - (e.shiftKey ? e.deltaY : e.deltaX),
          y: s.viewport.y - (e.shiftKey ? 0 : e.deltaY),
        });
      } else
        s.setViewport(
          zoomAt(
            s.viewport,
            p,
            Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.04 : 0.0015)),
          ),
        );
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [disabled]);
  const point = (e: ReactPointerEvent) => {
    const rect = root.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const begin = (e: ReactPointerEvent, node?: CanvasNode) => {
    if (disabled) return;
    if (e.button !== 0 && e.button !== 1) return;
    if ((e.target as HTMLElement).closest('button,input,textarea,select,a'))
      return;
    const pan = e.button === 1 || space.current;
    if (!pan && tool === 'connector') {
      e.preventDefault();
      e.stopPropagation();
      if (!node || node.shape?.kind === 'connector') return;
      if (!source) {
        setSource(node.id);
        useCanvas.getState().select([node.id]);
        return;
      }
      if (source === node.id) return;
      const s = useCanvas.getState();
      if (s.nodes.length >= 500 || !s.nodes.some((n) => n.id === source)) {
        setSource(null);
        return;
      }
      const connector: CanvasNode = {
        id: crypto.randomUUID(),
        kind: 'shape',
        title: 'Connector',
        color: '#708f7c',
        x: 0,
        y: 0,
        width: 24,
        height: 24,
        z: Math.max(0, ...s.nodes.map((n) => n.z)) + 1,
        shape: { kind: 'connector', source, target: node.id },
      };
      s.add(connectorBounds(connector, s.nodes));
      setTool('select');
      setSource(null);
      return;
    }
    if (!pan && tool !== 'select' && tool !== 'connector') {
      e.preventDefault();
      e.stopPropagation();
      root.current!.focus();
      root.current!.setPointerCapture(e.pointerId);
      const s = useCanvas.getState(),
        p = point(e),
        world = toWorld(p, s.viewport);
      gesture.current = {
        pointer: e.pointerId,
        start: p,
        latest: p,
        mode: 'draw',
        drawing: tool,
        points: [world, world],
        nodes: s.nodes,
        origin: s.viewport,
        ids: [],
        additive: [],
      };
      return;
    }
    if (
      !pan &&
      node &&
      node.kind !== 'shape' &&
      !(e.target as HTMLElement).closest('.node-grip')
    ) {
      useCanvas.getState().select([node.id]);
      e.stopPropagation();
      return;
    }
    if (!pan && node?.shape?.kind === 'connector') {
      useCanvas.getState().select([node.id]);
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    root.current!.focus();
    root.current!.setPointerCapture(e.pointerId);
    const s = useCanvas.getState();
    let ids = s.selected;
    if (node && !pan) {
      if (e.shiftKey) {
        ids = ids.includes(node.id)
          ? ids.filter((id) => id !== node.id)
          : [...ids, node.id];
        s.select(ids);
      } else if (!ids.includes(node.id)) {
        ids = [node.id];
        s.select(ids);
      }
      s.checkpoint();
      s.patch({
        [node.id]: { z: Math.max(0, ...s.nodes.map((n) => n.z)) + 1 },
      });
    } else if (!pan && !e.shiftKey) s.select([]);
    const p = point(e);
    gesture.current = {
      pointer: e.pointerId,
      start: p,
      latest: p,
      mode: pan ? 'pan' : node ? 'move' : 'select',
      nodes: s.nodes,
      origin: { x: s.viewport.x, y: s.viewport.y },
      ids,
      additive: e.shiftKey ? s.selected : [],
    };
  };
  const update = () => {
    frame.current = 0;
    const g = gesture.current;
    if (!g) return;
    const s = useCanvas.getState();
    const dx = (g.latest.x - g.start.x) / s.viewport.zoom;
    const dy = (g.latest.y - g.start.y) / s.viewport.zoom;
    if (g.mode === 'link') {
      setLinkDraft({
        source: toWorld(g.start, s.viewport),
        target: toWorld(g.latest, s.viewport),
      });
      return;
    }
    if (g.mode === 'draw') {
      setDraft(
        drawingNode(
          g.drawing!,
          g.points!,
          'draft',
          Math.max(0, ...s.nodes.map((n) => n.z)) + 1,
        ),
      );
      return;
    }
    if (g.mode === 'pan') {
      s.setViewport({
        ...s.viewport,
        x: g.origin.x + g.latest.x - g.start.x,
        y: g.origin.y + g.latest.y - g.start.y,
      });
      return;
    }
    if (g.mode === 'select') {
      const a = toWorld(g.start, s.viewport),
        b = toWorld(g.latest, s.viewport);
      const area = {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(a.x - b.x),
        height: Math.abs(a.y - b.y),
      };
      setMarquee(area);
      s.select([
        ...new Set([
          ...g.additive,
          ...s.nodes.filter((n) => intersects(n, area)).map((n) => n.id),
        ]),
      ]);
      return;
    }
    const updates: Record<string, Partial<CanvasNode>> = {};
    const anchor = g.nodes.find((n) => g.ids.includes(n.id));
    if (!anchor) return;
    const sx = snap(anchor.x + dx, s.snapGrid) - anchor.x,
      sy = snap(anchor.y + dy, s.snapGrid) - anchor.y;
    for (const n of g.nodes.filter((n) => g.ids.includes(n.id)))
      updates[n.id] =
        g.mode === 'resize'
          ? {
              width: Math.min(
                10000,
                Math.max(
                  n.kind === 'shape' ? 24 : 320,
                  snap(n.width + dx, s.snapGrid),
                ),
              ),
              height: Math.min(
                10000,
                Math.max(
                  n.kind === 'shape' ? 24 : 200,
                  snap(n.height + dy, s.snapGrid),
                ),
              ),
            }
          : { x: n.x + sx, y: n.y + sy };
    s.patch(updates);
  };
  const finish = (e: ReactPointerEvent) => {
    if (gesture.current?.pointer !== e.pointerId) return;
    if (frame.current) cancelAnimationFrame(frame.current);
    update();
    const g = gesture.current!;
    if (g.mode === 'link' && e.type !== 'pointercancel') {
      const target = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest('[data-node]')
        ?.getAttribute('data-node');
      if (target) useCanvas.getState().connect(g.ids[0], target);
    }
    if (
      g.mode === 'draw' &&
      e.type !== 'pointercancel' &&
      ((g.drawing === 'freehand' && g.points!.length > 2) ||
        Math.hypot(g.latest.x - g.start.x, g.latest.y - g.start.y) > 3) &&
      useCanvas.getState().nodes.length < 500
    ) {
      useCanvas
        .getState()
        .add(
          drawingNode(
            g.drawing!,
            g.points!,
            crypto.randomUUID(),
            Math.max(0, ...useCanvas.getState().nodes.map((n) => n.z)) + 1,
          ),
        );
      setTool('select');
    }
    gesture.current = null;
    setDraft(null);
    setLinkDraft(null);
    setMarquee(null);
    if (root.current?.hasPointerCapture(e.pointerId))
      root.current.releasePointerCapture(e.pointerId);
  };
  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );
  const beginResize = (e: ReactPointerEvent, node: CanvasNode) => {
    if (disabled) return;
    if (e.button !== 0 || node.shape?.kind === 'connector') return;
    e.preventDefault();
    e.stopPropagation();
    const s = useCanvas.getState();
    s.select([node.id]);
    s.checkpoint();
    root.current!.setPointerCapture(e.pointerId);
    const p = point(e);
    gesture.current = {
      pointer: e.pointerId,
      start: p,
      latest: p,
      mode: 'resize',
      nodes: s.nodes,
      origin: s.viewport,
      ids: [node.id],
      additive: [],
    };
  };
  return (
    <div
      ref={root}
      className={`canvas ${panning ? 'pan-ready' : ''} ${tool !== 'select' ? 'drawing-ready' : ''}`}
      tabIndex={0}
      aria-label="Infinite workspace canvas"
      onPointerDown={(e) => begin(e)}
      onPointerDownCapture={(e) => {
        if (tool !== 'select') {
          const id = (e.target as Element)
            .closest('[data-node]')
            ?.getAttribute('data-node');
          begin(
            e,
            nodes.find((n) => n.id === id),
          );
        }
      }}
      onPointerMove={(e) => {
        if (!gesture.current) return;
        gesture.current.latest = point(e);
        const g = gesture.current;
        if (g.mode === 'draw') {
          const p = toWorld(g.latest, useCanvas.getState().viewport);
          if (g.drawing === 'freehand') {
            const last = g.points!.at(-1)!;
            if (
              g.points!.length < 2048 &&
              Math.hypot(p.x - last.x, p.y - last.y) * viewport.zoom >= 2
            )
              g.points!.push(p);
          } else g.points = [g.points![0], p];
        }
        if (!frame.current) frame.current = requestAnimationFrame(update);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={() => {
        gesture.current = null;
        setMarquee(null);
        setDraft(null);
        setLinkDraft(null);
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`,
      }}
    >
      <div
        className="world"
        style={{
          transform: `translate(${viewport.x}px,${viewport.y}px) scale(${viewport.zoom})`,
        }}
      >
        <svg
          className="agent-link-layer"
          aria-label="Agent and shared-memory links"
        >
          {edges.map((edge) => {
            const a = nodes.find((n) => n.id === edge.source),
              b = nodes.find((n) => n.id === edge.target);
            if (!a || !b) return null;
            const forward = a.x < b.x;
            const start = { x: a.x + (forward ? a.width : 0), y: a.y + 25 },
              end = { x: b.x + (forward ? 0 : b.width), y: b.y + 25 };
            return (
              <g key={edge.id}>
                <path
                  d={`M${start.x},${start.y} C${start.x + (forward ? 90 : -90)},${start.y} ${end.x - (forward ? 90 : -90)},${end.y} ${end.x},${end.y}`}
                  className={
                    edge.kind === 'memory' ? 'memory-link' : 'agent-link'
                  }
                />
                <circle cx={start.x} cy={start.y} r="4" />
                <circle cx={end.x} cy={end.y} r="4" />
              </g>
            );
          })}
          {linkDraft && (
            <path
              className="link-draft"
              d={`M${linkDraft.source.x},${linkDraft.source.y} L${linkDraft.target.x},${linkDraft.target.y}`}
            />
          )}
        </svg>
        {nodes.map((node) => {
          const visible = nearViewport(node, viewport, size.width, size.height);
          return (
            <section
              key={node.id}
              data-node={node.id}
              className={`canvas-node ${node.kind === 'shape' ? 'shape-node' : ''} ${selected.includes(node.id) ? 'selected' : ''}`}
              style={{
                left: node.x,
                top: node.y,
                width: node.width,
                height: node.height,
                zIndex: node.z,
                borderTopColor: node.color,
              }}
              onPointerDown={(e) => begin(e, node)}
            >
              <header className="node-grip">
                <span className="node-kind">
                  {node.kind === 'terminal'
                    ? '>_'
                    : node.kind === 'note'
                      ? '▤'
                      : '◇'}
                </span>
                <strong>{node.title}</strong>
                <span className="node-type">
                  {node.kind === 'terminal'
                    ? node.shell
                    : node.kind === 'note'
                      ? 'MARKDOWN'
                      : node.kind === 'shape'
                        ? 'WHITEBOARD'
                        : node.kind === 'browser'
                          ? 'BROWSER'
                          : 'CANVAS CARD'}
                </span>
                <button
                  title={`Close ${node.title}`}
                  aria-label={`Close ${node.title}`}
                  onClick={() => onClose([node.id])}
                >
                  ×
                </button>
                {(node.kind === 'terminal' || node.kind === 'note') && (
                  <button
                    className="link-port"
                    title={`Drag to connect ${node.title}`}
                    aria-label={`Connect ${node.title}`}
                    onPointerDown={(e) => {
                      if (disabled || e.button !== 0) return;
                      e.preventDefault();
                      e.stopPropagation();
                      setTool('select');
                      setSource(null);
                      root.current!.setPointerCapture(e.pointerId);
                      const p = point(e);
                      gesture.current = {
                        pointer: e.pointerId,
                        start: p,
                        latest: p,
                        mode: 'link',
                        nodes,
                        origin: viewport,
                        ids: [node.id],
                        additive: [],
                      };
                      setLinkDraft({
                        source: toWorld(p, viewport),
                        target: toWorld(p, viewport),
                      });
                    }}
                  >
                    ↔
                  </button>
                )}
              </header>
              <div className="node-content">
                {(node.kind === 'shape' ? (
                  <ShapeNode node={node} nodes={nodes} />
                ) : (
                  renderNode?.(node, visible)
                )) ?? (
                  <div className="card-content">
                    <span className="eyebrow">ROOM FOR YOUR NEXT IDEA</span>
                    <h2>{node.title}</h2>
                    <p>Arrange your work in space.</p>
                    <p className="muted">
                      Drag the header to move. Pull the corner to resize.
                      Shift-click headers to select together.
                    </p>
                    <div className="card-rule" />
                    <span className="card-tag">Layout card</span>
                  </div>
                )}
              </div>
              {node.shape?.kind !== 'connector' && (
                <button
                  className="resize-handle"
                  title="Resize node"
                  aria-label={`Resize ${node.title}`}
                  onPointerDown={(e) => beginResize(e, node)}
                />
              )}
            </section>
          );
        })}
        {draft && (
          <div
            className="drawing-preview"
            style={{
              left: draft.x,
              top: draft.y,
              width: draft.width,
              height: draft.height,
              zIndex: 2147483646,
            }}
          >
            <ShapeNode node={draft} nodes={nodes} />
          </div>
        )}
        {marquee && (
          <div
            className="marquee"
            style={{
              left: marquee.x,
              top: marquee.y,
              width: marquee.width,
              height: marquee.height,
            }}
          />
        )}
      </div>
      {!nodes.length && tool === 'select' && (
        <div className="empty-state">
          <div className="empty-glyph">⌘</div>
          <span className="eyebrow">YOUR WORK, WITH ROOM TO BREATHE</span>
          <h1>
            A canvas for
            <br />
            what comes next.
          </h1>
          <p>
            Start a terminal. Give each agent its own space.
            <br />
            Keep the whole picture in view.
          </p>
          <span className="empty-hint">
            Create a node from the toolbar to begin ↗
          </span>
        </div>
      )}
      <div
        className="drawing-tools"
        role="toolbar"
        aria-label="Whiteboard tools"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {(
          [
            'select',
            'rectangle',
            'ellipse',
            'text',
            'arrow',
            'connector',
            'freehand',
          ] as const
        ).map((kind) => (
          <button
            key={kind}
            disabled={disabled}
            aria-pressed={tool === kind}
            title={
              kind === 'connector'
                ? 'Connector: click two nodes'
                : kind === 'select'
                  ? 'Select and move'
                  : `Draw ${kind}`
            }
            onClick={() => {
              setTool(kind);
              setSource(null);
              setDraft(null);
            }}
          >
            {
              {
                select: '↖',
                rectangle: '▭',
                ellipse: '◯',
                text: 'T',
                arrow: '↗',
                connector: '⇄',
                freehand: '✎',
              }[kind]
            }
          </button>
        ))}
        <span>
          {tool === 'select'
            ? 'Whiteboard'
            : tool === 'connector'
              ? source
                ? 'Click the second node'
                : 'Click the first node'
              : `Drag to draw ${tool} · Esc cancels`}
        </span>
      </div>
      <div className="canvas-hint">
        <kbd>Space</kbd> + drag to pan <span>·</span> Scroll to zoom{' '}
        <span>·</span> <kbd>Home</kbd> to fit
      </div>
      <div
        className="canvas-controls"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          title="Zoom out"
          onClick={() =>
            useCanvas
              .getState()
              .setViewport(
                zoomAt(
                  viewport,
                  { x: size.width / 2, y: size.height / 2 },
                  1 / 1.2,
                ),
              )
          }
        >
          −
        </button>
        <span>{Math.round(viewport.zoom * 100)}%</span>
        <button
          title="Zoom in"
          onClick={() =>
            useCanvas
              .getState()
              .setViewport(
                zoomAt(
                  viewport,
                  { x: size.width / 2, y: size.height / 2 },
                  1.2,
                ),
              )
          }
        >
          +
        </button>
        <i />
        <button
          title="Fit all nodes"
          onClick={() =>
            useCanvas
              .getState()
              .setViewport(fitViewport(nodes, size.width, size.height))
          }
        >
          Fit
        </button>
        <button
          title="Toggle snap to grid"
          className={snapGrid ? 'active' : ''}
          onClick={() => useCanvas.getState().toggleSnap()}
        >
          ⌗
        </button>
      </div>
      <Minimap nodes={nodes} width={size.width} height={size.height} />
    </div>
  );
}
function Minimap({
  nodes,
  width,
  height,
}: {
  nodes: CanvasNode[];
  width: number;
  height: number;
}) {
  const v = useCanvas((s) => s.viewport);
  const view = {
    x: -v.x / v.zoom,
    y: -v.y / v.zoom,
    width: width / v.zoom,
    height: height / v.zoom,
  };
  const left = Math.min(view.x, ...nodes.map((n) => n.x)) - 100,
    top = Math.min(view.y, ...nodes.map((n) => n.y)) - 100;
  const right =
      Math.max(view.x + view.width, ...nodes.map((n) => n.x + n.width)) + 100,
    bottom =
      Math.max(view.y + view.height, ...nodes.map((n) => n.y + n.height)) + 100;
  return (
    <div className="minimap" onPointerDown={(e) => e.stopPropagation()}>
      <span>OVERVIEW</span>
      <svg
        aria-label="Workspace minimap"
        viewBox={`${left} ${top} ${right - left} ${bottom - top}`}
        onPointerDown={(e) => {
          const ctm = e.currentTarget.getScreenCTM();
          if (!ctm) return;
          const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
            ctm.inverse(),
          );
          useCanvas.getState().setViewport({
            ...v,
            x: width / 2 - p.x * v.zoom,
            y: height / 2 - p.y * v.zoom,
          });
        }}
      >
        {nodes.map((n) => (
          <rect
            key={n.id}
            x={n.x}
            y={n.y}
            width={n.width}
            height={n.height}
            fill={n.color}
            opacity="0.6"
          />
        ))}
        <rect
          className="minimap-view"
          x={view.x}
          y={view.y}
          width={view.width}
          height={view.height}
        />
      </svg>
    </div>
  );
}
