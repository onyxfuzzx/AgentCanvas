import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  memo,
} from 'react';
import { WebglAddon } from '@xterm/addon-webgl';
import type { CanvasNode } from '../canvas/model';
import { useCanvas } from '../canvas/store';
import { getSession } from './registry';
import { gridSize } from './session';
import '@xterm/xterm/css/xterm.css';

// Keep below typical browser GPU context limits, even with twenty visible nodes.
let webglContexts = 0;
function attachWebgl(
  terminal: NonNullable<ReturnType<typeof getSession>>['terminal'],
) {
  if (webglContexts >= 6) return () => {};
  webglContexts++;
  let addon: WebglAddon | undefined;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    webglContexts--;
    try {
      addon?.dispose();
    } catch {
      /* xterm retains its fallback renderer */
    }
  };
  try {
    addon = new WebglAddon();
    terminal.loadAddon(addon);
    addon.onContextLoss(release);
  } catch {
    release();
  }
  return release;
}

export const TerminalNode = memo(function TerminalNode({
  node,
  visible,
}: {
  node: CanvasNode;
  visible: boolean;
}) {
  const entry = getSession(node.id);
  if (!entry)
    return (
      <div className="terminal-placeholder">
        Terminal session is unavailable.
      </div>
    );
  return <TerminalSurface node={node} visible={visible} entry={entry} />;
});
function TerminalSurface({
  node,
  visible,
  entry,
}: {
  node: CanvasNode;
  visible: boolean;
  entry: NonNullable<ReturnType<typeof getSession>>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const zoom = useCanvas((s) => s.viewport.zoom);
  const { session, terminal } = entry;
  const meta = useSyncExternalStore(session.subscribe, session.snapshot);
  useLayoutEffect(() => {
    if (!visible || !host.current) return;
    terminal.options.fontSize = 13 * zoom;
    if (!entry.opened) {
      terminal.open(host.current);
      entry.opened = true;
      const screen =
        terminal.element?.querySelector<HTMLElement>('.xterm-screen');
      if (screen && screen.offsetWidth && screen.offsetHeight) {
        entry.cellWidth = screen.offsetWidth / terminal.cols / zoom;
        entry.cellHeight = screen.offsetHeight / terminal.rows / zoom;
      }
    } else if (terminal.element) host.current.appendChild(terminal.element);
    terminal.refresh(0, terminal.rows - 1);
    let frame = 0;
    // Browser font metrics round at small zooms. Fit the font to the fixed grid
    // rather than resizing the PTY just because the canvas zoom changed.
    const fitFont = (attempt = 0) => {
      const element = host.current;
      const screen =
        terminal.element?.querySelector<HTMLElement>('.xterm-screen');
      if (!element || !screen) return;
      const width = element.clientWidth - 16 * zoom,
        height = element.clientHeight - 11 * zoom;
      const ratio = Math.min(
        1,
        width / Math.max(1, screen.offsetWidth),
        height / Math.max(1, screen.offsetHeight),
      );
      if (ratio < 0.999 && attempt < 4) {
        const font = terminal.options.fontSize ?? 13 * zoom;
        terminal.options.fontSize = Math.max(
          1,
          Math.min(font - 0.5, font * ratio),
        );
        frame = requestAnimationFrame(() => fitFont(attempt + 1));
      }
    };
    frame = requestAnimationFrame(() => fitFont());
    return () => cancelAnimationFrame(frame);
  }, [visible, entry, terminal, zoom, node.width, node.height]);
  useEffect(() => {
    session.setVisible(visible);
    if (!visible) return;
    const release = attachWebgl(terminal);
    return () => {
      session.setVisible(false);
      release();
      terminal.element?.remove();
    };
  }, [visible, session, terminal]);
  useLayoutEffect(() => {
    const { cols, rows } = gridSize(
      node.width,
      node.height,
      entry.cellWidth,
      entry.cellHeight,
    );
    void session.resize(cols, rows);
  }, [node.width, node.height, entry, session]);
  // Cancel the canvas transform, then scale the actual font. xterm receives
  // untransformed mouse coordinates and renders at the monitor's real DPI.
  // PTY rows/columns depend only on world dimensions, never canvas zoom.
  return (
    <div
      className="terminal-view"
      style={{
        width: `${(node.width - 2) * zoom}px`,
        height: `${(node.height - 42) * zoom}px`,
        paddingBottom: `${24 * zoom}px`,
        transform: `scale(${1 / zoom})`,
        transformOrigin: '0 0',
      }}
    >
      {visible ? (
        <div
          ref={host}
          className="terminal-host"
          style={{
            padding: `${8 * zoom}px ${6 * zoom}px ${3 * zoom}px ${10 * zoom}px`,
          }}
          onPointerDown={() => terminal.focus()}
        />
      ) : (
        <div className="terminal-placeholder">
          Rendering paused outside viewport
        </div>
      )}
      <div
        className={`terminal-footer terminal-status ${meta.status === 'running' ? meta.activity : meta.status}`}
        style={{
          fontSize: `${9 * zoom}px`,
          padding: `${5 * zoom}px ${10 * zoom}px`,
        }}
      >
        <span
          title={
            meta.manualActivity
              ? 'Activity label set manually'
              : `${meta.summary.text}${meta.summary.detail ? `: ${meta.summary.detail}` : ''}`
          }
        >
          ●{' '}
          {meta.status === 'running'
            ? meta.activity === 'waiting'
              ? meta.manualActivity
                ? 'waiting for input'
                : 'possible input prompt'
              : meta.activity === 'idle' && !meta.manualActivity
                ? 'quiet'
                : meta.activity
            : meta.status}
          {meta.status === 'running' && meta.manualActivity ? ' · manual' : ''}
          {meta.status === 'running' && !meta.manualActivity
            ? ' · heuristic'
            : ''}
          {meta.exitCode !== undefined ? ` (${meta.exitCode})` : ''}
        </span>
        <span>
          {meta.cols} × {meta.rows}
        </span>
        <span title={meta.error || meta.cwd}>
          {meta.error ||
            (meta.dropped ? `${meta.dropped} output bytes skipped · ` : '') +
              meta.cwd}
        </span>
      </div>
    </div>
  );
}
