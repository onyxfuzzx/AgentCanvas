import { useCallback, useState } from 'react';
import { Canvas } from './canvas/Canvas';
import { useCanvas } from './canvas/store';
import { toWorld } from './canvas/model';
import { isDesktop, windowAction } from './native';
import { TerminalNode } from './terminal/TerminalNode';
import { NewTerminal } from './terminal/NewTerminal';
import { closeSession } from './terminal/registry';
import { TerminalActivity } from './terminal/TerminalActivity';

export function App() {
  const { nodes, selected, past, future } = useCanvas();
  const [help, setHelp] = useState(false);
  const [newTerminal, setNewTerminal] = useState(false);
  const [notice, setNotice] = useState('');
  const close = useCallback((ids: string[]) => {
    void Promise.all(
      ids.map(async (id) => {
        try {
          await closeSession(id);
          return id;
        } catch (error) {
          setNotice(`Could not close terminal: ${String(error)}`);
          return null;
        }
      }),
    ).then((closed) =>
      useCanvas
        .getState()
        .remove(closed.filter((id): id is string => id !== null)),
    );
  }, []);
  const add = () => {
    const s = useCanvas.getState();
    const p = toWorld(
      { x: 160 + (nodes.length % 4) * 40, y: 110 + (nodes.length % 4) * 40 },
      s.viewport,
    );
    s.add({
      id: crypto.randomUUID(),
      kind: 'card',
      title: `Untitled ${nodes.length + 1}`,
      color: '#c9934b',
      ...p,
      width: 440,
      height: 300,
      z: Math.max(0, ...nodes.map((n) => n.z)) + 1,
    });
  };
  const focus = nodes.find((n) => n.id === selected[0]);
  return (
    <div className="app-shell">
      <header
        className="titlebar"
        onPointerDown={(e) => {
          if (e.button === 0 && !(e.target as HTMLElement).closest('button'))
            void windowAction('startDragging');
        }}
        onDoubleClick={() => void windowAction('toggleMaximize')}
      >
        <div className="brand-mark">
          <span />
          <span />
          <span />
        </div>
        <strong>{__PRODUCT_NAME__}</strong>
        <span className="title-divider" />
        <span>Workspace</span>
        <span className="title-session">LOCAL SESSION</span>
        {isDesktop() && (
          <div className="window-controls">
            <button
              aria-label="Minimize"
              onClick={() => void windowAction('minimize')}
            >
              −
            </button>
            <button
              aria-label="Maximize"
              onClick={() => void windowAction('toggleMaximize')}
            >
              □
            </button>
            <button
              className="window-close"
              aria-label="Close application"
              onClick={() => void windowAction('close')}
            >
              ×
            </button>
          </div>
        )}
      </header>
      <div className="workspace-body">
        <aside className="sidebar">
          <div className="workspace-label">
            <span className="workspace-icon">⌗</span>
            <div>
              <strong>Personal workspace</strong>
              <small>Untitled session</small>
            </div>
          </div>
          <div className="section-label">
            EXPLORER <span>{nodes.length.toString().padStart(2, '0')}</span>
          </div>
          <div className="workspace-nav">
            <span>▦</span> Canvas <small>Live</small>
          </div>
          <div className="node-list">
            {nodes.map((n) => (
              <button
                key={n.id}
                className={selected.includes(n.id) ? 'chosen' : ''}
                onClick={() => {
                  useCanvas.getState().select([n.id]);
                  const canvas = document.querySelector('.canvas')!;
                  const v = useCanvas.getState().viewport;
                  useCanvas.getState().setViewport({
                    ...v,
                    x: canvas.clientWidth / 2 - (n.x + n.width / 2) * v.zoom,
                    y: canvas.clientHeight / 2 - (n.y + n.height / 2) * v.zoom,
                  });
                }}
              >
                <span style={{ color: n.color }}>
                  {n.kind === 'terminal' ? '>_' : '◇'}
                </span>
                <span>{n.title}</span>
              </button>
            ))}
            {!nodes.length && (
              <p className="sidebar-empty">Your nodes will appear here.</p>
            )}
          </div>
          {focus && (
            <div className="inspector">
              <div className="section-label">NODE DETAILS</div>
              <label>
                Title
                <input
                  value={focus.title}
                  maxLength={80}
                  onFocus={() => useCanvas.getState().checkpoint()}
                  onChange={(e) =>
                    useCanvas
                      .getState()
                      .patch({ [focus.id]: { title: e.target.value } })
                  }
                />
              </label>
              <label>
                Accent
                <input
                  type="color"
                  value={focus.color}
                  onFocus={() => useCanvas.getState().checkpoint()}
                  onChange={(e) =>
                    useCanvas
                      .getState()
                      .patch({ [focus.id]: { color: e.target.value } })
                  }
                />
              </label>
              <small>
                {Math.round(focus.x)}, {Math.round(focus.y)} ·{' '}
                {Math.round(focus.width)} × {Math.round(focus.height)}
              </small>
              {focus.kind === 'terminal' && <TerminalActivity id={focus.id} />}
            </div>
          )}
          <div className="sidebar-footer">
            <span className="local-dot" /> Everything stays on your device
            <small>Layout is kept for this session only.</small>
            <button onClick={() => setHelp(true)}>
              Keyboard shortcuts <kbd>?</kbd>
            </button>
          </div>
        </aside>
        <main className="main-workspace">
          <div className="toolbar">
            <div className="breadcrumb">
              Workspace <span>/</span>
              <strong>Canvas</strong>
            </div>
            <div className="toolbar-actions">
              <button
                title="Undo (Ctrl+Z)"
                disabled={!past.length}
                onClick={() => useCanvas.getState().undo()}
              >
                ↶
              </button>
              <button
                title="Redo (Ctrl+Shift+Z)"
                disabled={!future.length}
                onClick={() => useCanvas.getState().redo()}
              >
                ↷
              </button>
              <i />
              <button
                className="add-card"
                title="New layout card"
                onClick={add}
              >
                ◇ Card
              </button>
              <button className="new-node" onClick={() => setNewTerminal(true)}>
                <span>+</span> New terminal
              </button>
            </div>
          </div>
          <Canvas
            onClose={close}
            renderNode={(node, visible) =>
              node.kind === 'terminal' ? (
                <TerminalNode node={node} visible={visible} />
              ) : undefined
            }
          />
          <footer className="statusbar">
            <span>
              <span className="local-dot" /> Local workspace
            </span>
            <span>
              {nodes.length} nodes <b>·</b> {selected.length} selected
            </span>
            <span>SESSION ONLY</span>
          </footer>
        </main>
      </div>
      {newTerminal && <NewTerminal onClose={() => setNewTerminal(false)} />}
      {notice && (
        <div className="notice" role="alert">
          {notice}
          <button onClick={() => setNotice('')} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="dialog shortcuts"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcut-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="dialog-close"
              onClick={() => setHelp(false)}
              aria-label="Close shortcuts"
            >
              ×
            </button>
            <span className="eyebrow">MAKE YOURSELF AT HOME</span>
            <h2 id="shortcut-title">A few useful shortcuts.</h2>
            {[
              ['Pan', 'Space + drag / middle drag'],
              ['Zoom', 'Mouse wheel / Ctrl + trackpad'],
              ['Select together', 'Shift + click node headers'],
              ['Select an area', 'Drag on the canvas'],
              ['Undo / redo', 'Ctrl + Z / Ctrl + Shift + Z'],
              ['Fit all nodes', 'Home'],
              ['Select all', 'Ctrl + A'],
              ['Close selected', 'Delete'],
            ].map(([label, key]) => (
              <div className="shortcut" key={label}>
                <span>{label}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
            <p>
              Canvas shortcuts stay out of the way while typing in a terminal or
              field.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
