import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Canvas } from './canvas/Canvas';
import { useCanvas } from './canvas/store';
import { toWorld } from './canvas/model';
import {
  isDesktop,
  windowAction,
  onCloseRequested,
  destroyWindow,
  invoke,
} from './native';
import { TerminalNode } from './terminal/TerminalNode';
import { NewTerminal } from './terminal/NewTerminal';
import { closeSession } from './terminal/registry';
import { TerminalActivity } from './terminal/TerminalActivity';
import { RestartTerminal } from './terminal/RestartTerminal';
import { workspace, useWorkspace } from './workspace/runtime';
import { WorkspacePanel } from './workspace/WorkspacePanel';
import { NoteNode } from './notes/NoteNode';
import { notes } from './notes/runtime';
import { useStore } from 'zustand';
import { collaboration } from './collaboration/runtime';
import { ConnectionsPanel } from './collaboration/ConnectionsPanel';
import { BrowserNode } from './browser/BrowserNode';
import { browsers, startBrowserSurfaces } from './browser/runtime';
import { ThemeControl } from './ui/ThemeControl';
import { ModalSection } from './ui/ModalSection';
import { AgentPresets } from './agents/AgentPresets';
import { TaskBoard } from './tasks/TaskBoard';

export function App() {
  const nodes = useCanvas((s) => s.nodes);
  const selected = useCanvas((s) => s.selected);
  const past = useCanvas((s) => s.past);
  const future = useCanvas((s) => s.future);
  const [help, setHelp] = useState(false);
  const [newTerminal, setNewTerminal] = useState(false);
  const [newAgent, setNewAgent] = useState(false);
  const [agentPresets, setAgentPresets] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [workspacesOpen, setWorkspacesOpen] = useState(false);
  const [restartId, setRestartId] = useState<string | null>(null);
  const [closeError, setCloseError] = useState('');
  const closing = useRef(false);
  const [creatingNote, setCreatingNote] = useState(false);
  const creation = useRef<Promise<void> | null>(null);
  const work = useWorkspace();
  const noteState = useSyncExternalStore(notes.subscribe, notes.snapshot);
  const links = useStore(collaboration.state);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const pendingMessages = links.logs.filter(
    (l) => l.status === 'pending' && l.workspaceId === work.active?.document.id,
  ).length;
  const busy = work.phase !== 'ready' || work.closing || creatingNote;
  useEffect(() => {
    if (isDesktop()) collaboration.start();
    void workspace.initialize().catch((error) => setNotice(String(error)));
  }, []);
  useEffect(() => startBrowserSurfaces(), []);
  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    void Promise.resolve(creation.current)
      .then(() => workspace.prepareToClose())
      .then(() => destroyWindow())
      .catch((error) => {
        closing.current = false;
        workspace.cancelClose();
        setCloseError(String(error));
      });
  }, []);
  useEffect(() => {
    let alive = true;
    let stop: (() => void) | undefined;
    void onCloseRequested((event) => {
      event.preventDefault();
      requestClose();
    }).then((unlisten) => {
      if (alive) stop = unlisten;
      else unlisten();
    });
    return () => {
      alive = false;
      stop?.();
    };
  }, [requestClose]);
  const close = useCallback((ids: string[]) => {
    if (
      workspace.state.getState().phase !== 'ready' ||
      workspace.state.getState().closing
    )
      return;
    void Promise.all(
      ids.map(async (id) => {
        try {
          if (
            useCanvas.getState().nodes.find((n) => n.id === id)?.kind ===
            'browser'
          )
            await browsers.close(id);
          else await closeSession(id);
          return id;
        } catch (error) {
          setNotice(`Could not close node: ${String(error)}`);
          return null;
        }
      }),
    ).then((closed) =>
      useCanvas
        .getState()
        .remove(closed.filter((id): id is string => id !== null)),
    );
  }, []);
  const add = (kind: 'card' | 'browser' = 'card') => {
    const s = useCanvas.getState();
    if (s.nodes.length >= 500) {
      setNotice('A workspace supports up to 500 nodes.');
      return;
    }
    const p = toWorld(
      { x: 160 + (nodes.length % 4) * 40, y: 110 + (nodes.length % 4) * 40 },
      s.viewport,
    );
    s.add({
      id: crypto.randomUUID(),
      kind,
      title: kind === 'browser' ? 'Browser' : `Untitled ${nodes.length + 1}`,
      color: '#c9934b',
      ...p,
      width: kind === 'browser' ? 800 : 440,
      height: kind === 'browser' ? 600 : 300,
      ...(kind === 'browser' ? { url: '' } : {}),
      z: Math.max(0, ...nodes.map((n) => n.z)) + 1,
    });
  };
  const addNote = () => {
    const active = work.active;
    if (!active) {
      setNotice('Open a desktop workspace to create file-backed notes.');
      return;
    }
    if (nodes.length >= 500) {
      setNotice('A workspace supports up to 500 nodes.');
      return;
    }
    if (creation.current) return;
    setCreatingNote(true);
    const id = crypto.randomUUID();
    creation.current = (async () => {
      const relativePath = await invoke<string>('note_create', {
        workspaceId: active.document.id,
        id,
      });
      const s = useCanvas.getState();
      const p = toWorld(
        {
          x: 180 + (s.nodes.length % 4) * 40,
          y: 150 + (s.nodes.length % 4) * 40,
        },
        s.viewport,
      );
      s.add({
        id,
        kind: 'note',
        title: 'New note',
        color: '#c9934b',
        ...p,
        width: 460,
        height: 400,
        z: Math.max(0, ...s.nodes.map((n) => n.z)) + 1,
        relativePath,
      });
    })()
      .catch((error) => setNotice(String(error)))
      .finally(() => {
        creation.current = null;
        setCreatingNote(false);
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
        <span>{work.active?.document.name ?? 'Workspace'}</span>
        <span className="title-session">
          {isDesktop() ? 'LOCAL WORKSPACE' : 'WEB PREVIEW'}
        </span>
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
      <div className="workspace-body" inert={busy}>
        <aside className="sidebar">
          <button
            className="workspace-label workspace-picker"
            disabled={!isDesktop()}
            onClick={() => setWorkspacesOpen(true)}
            title={work.active?.folder ?? 'Choose a workspace'}
          >
            <span className="workspace-icon">⌗</span>
            <div>
              <strong>
                {work.active?.document.name ?? 'Personal workspace'}
              </strong>
              <small>
                {isDesktop() ? 'Manage workspaces ↗' : 'Temporary web preview'}
              </small>
            </div>
          </button>
          <div className="section-label">
            EXPLORER <span>{nodes.length.toString().padStart(2, '0')}</span>
          </div>
          <div className="workspace-nav">
            <span>▦</span> Canvas <small>Live</small>
          </div>
          <button
            disabled={busy || !work.active}
            onClick={() => setTasksOpen(true)}
          >
            Tasks
          </button>
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
              {focus.agent && (
                <small title={focus.agent.instructions}>
                  {focus.agent.provider} · {focus.agent.roleName}
                  <br />
                  Preset: {focus.agent.profileName}
                </small>
              )}
              {focus.kind === 'shape' && focus.shape?.kind === 'text' && (
                <label>
                  Text
                  <textarea
                    aria-label="Whiteboard text"
                    value={focus.shape.text ?? ''}
                    maxLength={4096}
                    onFocus={() => useCanvas.getState().checkpoint()}
                    onChange={(e) =>
                      useCanvas.getState().patch({
                        [focus.id]: {
                          shape: { ...focus.shape!, text: e.target.value },
                        },
                      })
                    }
                  />
                </label>
              )}
              <div className="layer-buttons">
                <button
                  title="Bring to front"
                  onClick={() => {
                    const s = useCanvas.getState();
                    s.checkpoint();
                    s.patch({
                      [focus.id]: {
                        z: Math.max(0, ...nodes.map((n) => n.z)) + 1,
                      },
                    });
                  }}
                >
                  To front
                </button>
                <button
                  title="Send to back"
                  onClick={() => {
                    const s = useCanvas.getState();
                    s.checkpoint();
                    s.patch(
                      Object.fromEntries(
                        nodes.map((n) => [
                          n.id,
                          { z: n.id === focus.id ? 0 : n.z + 1 },
                        ]),
                      ),
                    );
                  }}
                >
                  To back
                </button>
              </div>
              {focus.kind === 'terminal' && (
                <RestartTerminal
                  id={focus.id}
                  onRestart={() => setRestartId(focus.id)}
                />
              )}
            </div>
          )}
          <div className="sidebar-footer">
            <ThemeControl />
            <button
              className="presets-button"
              onClick={() => setAgentPresets(true)}
              disabled={busy}
            >
              Agent presets
            </button>
            <span className="local-dot" /> Workspace saves stay on your device
            <small>
              {work.active
                ? 'Layout autosaves to your workspace folder.'
                : 'Open the desktop app to save workspaces.'}
            </small>
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
              {work.active && (
                <button
                  className="save-workspace"
                  onClick={() =>
                    void workspace
                      .save()
                      .catch((error) => setNotice(String(error)))
                  }
                  title={work.active.folder}
                >
                  {noteState.state === 'error'
                    ? 'Note error · retry'
                    : noteState.state === 'saving'
                      ? 'Saving notes…'
                      : noteState.state === 'unsaved'
                        ? 'Save notes'
                        : work.saveState === 'saving'
                          ? 'Saving…'
                          : work.saveState === 'error'
                            ? 'Retry save'
                            : work.saveState === 'unsaved'
                              ? 'Save now'
                              : 'Saved ✓'}
                </button>
              )}
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
                className="connections-button"
                onClick={() => setConnectionsOpen(!connectionsOpen)}
                title="Agent links, shared notes and message approval logs"
              >
                ↔ Links {pendingMessages > 0 && <b>{pendingMessages}</b>}
              </button>
              <button
                className="add-card"
                title="New layout card"
                onClick={() => add()}
              >
                ◇ Card
              </button>
              <button className="new-node" onClick={() => setNewTerminal(true)}>
                <span>+</span> New terminal
              </button>
              <button className="new-node" onClick={() => setNewAgent(true)}>
                + Agent
              </button>
              <button
                className="add-note"
                title="Create a Markdown note file"
                onClick={addNote}
              >
                ▤ Note
              </button>
              <button
                className="add-browser"
                onClick={() => add('browser')}
                title="New browser node"
              >
                ◎ Browser
              </button>
            </div>
          </div>
          <Canvas
            disabled={busy}
            onClose={close}
            renderNode={(node, visible) =>
              node.kind === 'terminal' ? (
                <TerminalNode node={node} visible={visible} />
              ) : node.kind === 'note' && work.active ? (
                <NoteNode
                  node={node}
                  workspaceId={work.active.document.id}
                  visible={visible}
                />
              ) : node.kind === 'browser' ? (
                <BrowserNode node={node} />
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
            <span>
              {noteState.state === 'error'
                ? 'NOTE ERROR'
                : noteState.state === 'saving'
                  ? 'SAVING NOTES…'
                  : noteState.state === 'unsaved'
                    ? 'UNSAVED NOTES'
                    : work.active
                      ? work.saveState === 'error'
                        ? 'SAVE FAILED'
                        : work.saveState === 'saving'
                          ? 'SAVING…'
                          : work.saveState === 'unsaved'
                            ? 'UNSAVED CHANGES'
                            : 'SAVED LOCALLY'
                      : 'TEMPORARY PREVIEW'}
            </span>
          </footer>
        </main>
      </div>
      {noteState.error && work.phase === 'ready' && (
        <div className="notes-warning" role="status">
          {noteState.error}
        </div>
      )}
      {newTerminal && (
        <NewTerminal
          defaultCwd={work.active?.folder}
          onClose={() => setNewTerminal(false)}
        />
      )}
      {newAgent && (
        <NewTerminal
          agentMode
          defaultCwd={work.active?.folder}
          onClose={() => setNewAgent(false)}
        />
      )}
      {agentPresets && <AgentPresets onClose={() => setAgentPresets(false)} />}
      {tasksOpen && work.active && !busy && (
        <TaskBoard
          key={work.active.document.id}
          workspaceId={work.active.document.id}
          onClose={() => setTasksOpen(false)}
        />
      )}
      {connectionsOpen && (
        <ConnectionsPanel
          workspaceId={work.active?.document.id ?? ''}
          onClose={() => setConnectionsOpen(false)}
          disabled={busy}
        />
      )}
      {!connectionsOpen && pendingMessages > 0 && (
        <button
          className="pending-badge"
          onClick={() => setConnectionsOpen(true)}
        >
          {pendingMessages} peer message(s) awaiting approval
        </button>
      )}
      {links.error && !connectionsOpen && (
        <button
          className="pending-badge error-text"
          onClick={() => setConnectionsOpen(true)}
        >
          Agent links need attention
        </button>
      )}
      {restartId && nodes.find((n) => n.id === restartId) && (
        <NewTerminal
          existing={nodes.find((n) => n.id === restartId)}
          onClose={() => setRestartId(null)}
        />
      )}
      {workspacesOpen && (
        <WorkspacePanel onClose={() => setWorkspacesOpen(false)} />
      )}
      {busy && !workspacesOpen && (
        <div className="workspace-loading" role="status">
          <h2>
            {creatingNote
              ? 'Creating note…'
              : work.closing
                ? 'Saving before closing…'
                : work.phase === 'error'
                  ? 'Workspace could not open'
                  : work.phase === 'restoring'
                    ? 'Restoring terminals…'
                    : 'Opening workspace…'}
          </h2>
          {work.phase === 'error' ? (
            <>
              <p>{work.error}</p>
              <button onClick={() => setWorkspacesOpen(true)}>
                Choose another workspace
              </button>
            </>
          ) : (
            <p>Your saved layout stays on this device.</p>
          )}
        </div>
      )}
      {(work.recovered || work.restoreErrors.length > 0 || work.error) &&
        work.phase === 'ready' && (
          <div className="workspace-warning" role="status">
            {work.error ||
              (work.recovered
                ? 'Recovered the last good backup. Save to repair the layout; the damaged file will be archived.'
                : `${work.restoreErrors.length} terminal(s) could not restart. Select a node to correct its directory or shell.`)}
            {work.restoreErrors.length > 0 && (
              <details>
                <summary>Details</summary>
                {work.restoreErrors.map((error) => (
                  <p key={error}>{error}</p>
                ))}
              </details>
            )}
          </div>
        )}
      {closeError && (
        <div className="modal-backdrop">
          <ModalSection
            titleId="close-error-title"
            onClose={() => {
              setCloseError('');
              workspace.cancelClose();
            }}
          >
            <h2 id="close-error-title">Workspace could not save.</h2>
            <p className="error-text">{closeError}</p>
            <p>
              Keep working to retain your layout and note drafts, or close and
              discard unsaved changes.
            </p>
            <button
              className="primary-button"
              onClick={() => {
                setCloseError('');
                requestClose();
              }}
            >
              Retry save and close
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                setCloseError('');
                workspace.cancelClose();
              }}
            >
              Keep working
            </button>
            <button
              className="secondary-button"
              onClick={() =>
                void destroyWindow().catch((error) =>
                  setCloseError(String(error)),
                )
              }
            >
              Close without saving
            </button>
          </ModalSection>
        </div>
      )}
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
          <ModalSection
            className="dialog shortcuts"
            titleId="shortcut-title"
            onClose={() => setHelp(false)}
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
              ['Move selected', 'Arrow keys · Shift for grid steps'],
              ['Resize selected', 'Alt + arrows · Shift for grid steps'],
            ].map(([label, key]) => (
              <div className="shortcut" key={label}>
                <span>{label}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
            <p>
              Canvas shortcuts stay out of the way while typing in a terminal or
              field. Move and resize shortcuts work while the canvas or a node
              header has focus.
            </p>
          </ModalSection>
        </div>
      )}
    </div>
  );
}
