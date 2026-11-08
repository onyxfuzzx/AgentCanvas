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
} from './model';
import { useCanvas } from './store';

type Gesture = {
  pointer: number;
  start: Point;
  latest: Point;
  mode: 'pan' | 'move' | 'resize' | 'select';
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
  const { nodes, selected, viewport, snapGrid } = useCanvas();
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef(0);
  const space = useRef(false);
  const [panning, setPanning] = useState(false);
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
      if (e.key === 'Escape') useCanvas.getState().select([]);
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
        (e.target as HTMLElement).closest('.terminal-host') &&
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
    if ((e.target as HTMLElement).closest('button,input,select,a')) return;
    const pan = e.button === 1 || space.current;
    if (!pan && node && !(e.target as HTMLElement).closest('.node-grip')) {
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
              width: Math.max(320, snap(n.width + dx, s.snapGrid)),
              height: Math.max(200, snap(n.height + dy, s.snapGrid)),
            }
          : { x: n.x + sx, y: n.y + sy };
    s.patch(updates);
  };
  const finish = (e: ReactPointerEvent) => {
    if (gesture.current?.pointer !== e.pointerId) return;
    if (frame.current) cancelAnimationFrame(frame.current);
    update();
    gesture.current = null;
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
    if (e.button !== 0) return;
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
      className={`canvas ${panning ? 'pan-ready' : ''}`}
      tabIndex={0}
      aria-label="Infinite workspace canvas"
      onPointerDown={(e) => begin(e)}
      onPointerMove={(e) => {
        if (!gesture.current) return;
        gesture.current.latest = point(e);
        if (!frame.current) frame.current = requestAnimationFrame(update);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={() => {
        gesture.current = null;
        setMarquee(null);
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
        {nodes.map((node) => {
          const visible = nearViewport(node, viewport, size.width, size.height);
          return (
            <section
              key={node.id}
              data-node={node.id}
              className={`canvas-node ${selected.includes(node.id) ? 'selected' : ''}`}
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
                  {node.kind === 'terminal' ? '>_' : '◇'}
                </span>
                <strong>{node.title}</strong>
                <span className="node-type">
                  {node.kind === 'terminal' ? node.shell : 'CANVAS CARD'}
                </span>
                <button
                  title={`Close ${node.title}`}
                  aria-label={`Close ${node.title}`}
                  onClick={() => onClose([node.id])}
                >
                  ×
                </button>
              </header>
              <div className="node-content">
                {renderNode?.(node, visible) ?? (
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
              <button
                className="resize-handle"
                title="Resize node"
                aria-label={`Resize ${node.title}`}
                onPointerDown={(e) => beginResize(e, node)}
              />
            </section>
          );
        })}
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
      {!nodes.length && (
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
