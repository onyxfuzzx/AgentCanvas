import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Icon, nodeIcon } from './ui/Icon';
import { WindowControls } from './ui/WindowControls';
import { panelInsets } from './ui/layout';
import { useCompactLayout } from './ui/useMediaQuery';
import { views, readAppearance, type View } from './ui/design';
import {
  NotesPage,
  ActivityPage,
  SettingsPage,
  PageHeading,
} from './ui/WorkspacePages';
import { CommandPalette, type PaletteAction } from './ui/CommandPalette';
import { teamOperations } from './team/runtime';
import type { AreaCatalog } from './areas/model';
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
import { AreasPanel } from './areas/AreasPanel';
import { ReviewPage } from './areas/ReviewPage';
import type { Area } from './areas/model';
import { TeamPanel } from './team/TeamPanel';
import type { TeamSnapshot } from './team/model';

export function App() {
  const nodes = useCanvas((s) => s.nodes);
  const selected = useCanvas((s) => s.selected);
  const past = useCanvas((s) => s.past);
  const future = useCanvas((s) => s.future);
  const compactLayout = useCompactLayout();
  const [wideSidebarOpen, setWideSidebarOpen] = useState(true);
  const [compactSidebarOpen, setCompactSidebarOpen] = useState(false);
  const sidebarOpen = compactLayout ? compactSidebarOpen : wideSidebarOpen;
  const setSidebarOpen = compactLayout
    ? setCompactSidebarOpen
    : setWideSidebarOpen;
  const shell = useRef<HTMLDivElement>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [help, setHelp] = useState(false);
  const [newTerminal, setNewTerminal] = useState(false);
  const [newAgent, setNewAgent] = useState(false);
  const [agentPresets, setAgentPresets] = useState(false);
  const [view, setView] = useState<View>('canvas');
  const tasksOpen = view === 'tasks';
  const areasOpen = view === 'areas';
  const teamOpen = view === 'team';
  const setTasksOpen = (open: boolean) => setView(open ? 'tasks' : 'canvas');
  const setAreasOpen = (open: boolean) => setView(open ? 'areas' : 'canvas');
  const setTeamOpen = (open: boolean) => setView(open ? 'team' : 'canvas');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [appearance, setAppearance] = useState(readAppearance);
  const [treeOpen, setTreeOpen] = useState(true);
  const [drawOpen, setDrawOpen] = useState(false);
  const [catalog, setCatalog] = useState<AreaCatalog>();
  const [teamData, setTeamData] = useState<TeamSnapshot>();
  const [teamControlBusy, setTeamControlBusy] = useState(false);
  const [reviewAreaId, setReviewAreaId] = useState<string>();
  const [teamAreaScope, setTeamAreaScope] = useState<string>();
  const [teamAttention, setTeamAttention] = useState('');
  const [launchArea, setLaunchArea] = useState<Area>();
  const areaScope = useCanvas((s) => s.areaScope);
  const areaDirectory = useCanvas((s) => s.areaDirectory);
  const [notice, setNotice] = useState('');
  const [workspacesOpen, setWorkspacesOpen] = useState(false);
  const [restartId, setRestartId] = useState<string | null>(null);
  const [closeError, setCloseError] = useState('');
  const closing = useRef(false);
  const [creatingNote, setCreatingNote] = useState(false);
  const creation = useRef<Promise<void> | null>(null);
  const work = useWorkspace();
  useEffect(() => {
    const workspaceId = work.active?.document.id;
    setTeamData(undefined);
    setCatalog(undefined);
    setTeamAttention('');
    if (!workspaceId || work.phase !== 'ready') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const d = await invoke<TeamSnapshot>('team_snapshot', { workspaceId });
        if (!stopped) setTeamData(d);
        const r = d.snapshot.board.orchestration;
        if (!stopped)
          setTeamAttention(
            d.schedulerError || (r?.state === 'blocked' ? r.reason : ''),
          );
      } catch {
        /* The team panel displays actionable native errors. */
      }
      if (!stopped) timer = setTimeout(() => void tick(), 3000);
    };
    void tick();
    void invoke<AreaCatalog>('area_catalog', { workspaceId })
      .then((c) => {
        if (!stopped) setCatalog(c);
      })
      .catch(() => {});
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [work.active?.document.id, work.phase]);
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
      {
        x: (sidebarOpen ? 280 : 40) + (nodes.length % 4) * 24,
        y: 130 + (nodes.length % 4) * 24,
      },
      s.viewport,
    );
    s.add({
      id: crypto.randomUUID(),
      kind,
      ...(s.areaScope ? { areaId: s.areaScope } : {}),
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
          x: (sidebarOpen ? 280 : 40) + (s.nodes.length % 4) * 24,
          y: 140 + (s.nodes.length % 4) * 24,
        },
        s.viewport,
      );
      s.add({
        id,
        kind: 'note',
        ...(s.areaScope ? { areaId: s.areaScope } : {}),
        title: 'New note',
        color: '#c9934b',
        ...p,
        width: 320,
        height: 200,
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
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.grid = String(appearance.grid);
    root.dataset.motion = String(appearance.motion);
    if (appearance.accent)
      root.style.setProperty('--accent', appearance.accent);
    else root.style.removeProperty('--accent');
    try {
      localStorage.setItem(
        'agentcanvas.appearance',
        JSON.stringify(appearance),
      );
    } catch {
      /* Preferences still work without storage. */
    }
  }, [appearance]);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (
        (e.target as HTMLElement)?.closest(
          'input,textarea,select,[contenteditable="true"],.terminal-host',
        )
      )
        return;
      if (!e.ctrlKey && !e.metaKey && !e.altKey && /^[1-8]$/.test(e.key))
        setView(views[Number(e.key) - 1][0]);
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, []);
  const focusNode = (id: string) => {
    setView('canvas');
    useCanvas.getState().select([id]);
    requestAnimationFrame(() => {
      const node = useCanvas.getState().nodes.find((n) => n.id === id);
      const canvas = document.querySelector('.canvas');
      if (!node || !canvas) return;
      if (
        useCanvas.getState().areaScope &&
        node.areaId !== useCanvas.getState().areaScope
      )
        useCanvas.getState().setAreaScope(null);
      const v = useCanvas.getState().viewport;
      const left = sidebarOpen ? 260 : 0,
        right = inspectorOpen ? 310 : 0;
      useCanvas.getState().setViewport({
        ...v,
        x:
          left +
          (canvas.clientWidth - left - right) / 2 -
          (node.x + node.width / 2) * v.zoom,
        y: canvas.clientHeight / 2 - (node.y + node.height / 2) * v.zoom,
      });
    });
  };
  const paletteActions: PaletteAction[] = [
    ...views.map(([id, label, icon], i) => ({
      label,
      icon,
      detail: `View ${i + 1}`,
      run: () => setView(id),
    })),
    ...nodes.map((n) => ({
      label: n.title,
      icon: nodeIcon(n),
      detail: n.kind,
      run: () => focusNode(n.id),
    })),
    ...(teamData?.snapshot.board.tasks ?? []).map((t) => ({
      label: t.title,
      icon: 'tasks' as const,
      detail: t.id,
      run: () => {
        setView('tasks');
        setTaskSelection(t.id);
      },
    })),
    {
      label: 'New agent',
      icon: 'agent',
      detail: 'Action',
      run: () => setNewAgent(true),
    },
    {
      label: 'New terminal',
      icon: 'terminal',
      detail: 'Action',
      run: () => setNewTerminal(true),
    },
    { label: 'New note', icon: 'note', detail: 'Action', run: addNote },
    {
      label: 'Connections',
      icon: 'link',
      detail: 'Action',
      run: () => setConnectionsOpen(true),
    },
    {
      label: 'Keyboard shortcuts',
      icon: 'keyboard',
      detail: 'Action',
      run: () => setHelp(true),
    },
  ];
  const run = teamData?.snapshot.board.orchestration;
  const toggleDispatch = async () => {
    const workspaceId = work.active?.document.id;
    if (!workspaceId || !run || run.state !== 'running' || teamControlBusy) {
      setView('team');
      return;
    }
    setTeamControlBusy(true);
    try {
      await teamOperations.invoke('team_control', {
        workspaceId,
        revision: teamData.snapshot.board.revision,
        control: { type: 'pause' },
      });
      setTeamData(await invoke<TeamSnapshot>('team_snapshot', { workspaceId }));
    } catch (error) {
      setNotice(String(error));
    } finally {
      setTeamControlBusy(false);
    }
  };
  const [taskSelection, setTaskSelection] = useState<string>();
  const focus = nodes.find((n) => n.id === selected[0]);
  return (
    <div
      ref={shell}
      className="app-shell"
      data-view={view}
      data-drawing={drawOpen}
    >
      <header
        className="titlebar"
        aria-hidden="true"
        onPointerDown={(e) => {
          if (e.button === 0) void windowAction('startDragging');
        }}
        onDoubleClick={() => void windowAction('toggleMaximize')}
      />
      <div
        className={`workspace-body ${sidebarOpen ? '' : 'sidebar-hidden'} ${inspectorOpen ? 'inspector-visible' : ''}`}
        inert={busy}
      >
        <aside
          className="sidebar"
          id="workspace-navigation"
          aria-label="Workspace navigation"
          inert={!sidebarOpen}
        >
          <div
            className="sidebar-heading"
            onPointerDown={(e) => {
              if (
                e.button === 0 &&
                !(e.target as HTMLElement).closest('button')
              )
                void windowAction('startDragging');
            }}
            onDoubleClick={(e) => {
              if (!(e.target as HTMLElement).closest('button'))
                void windowAction('toggleMaximize');
            }}
          >
            <WindowControls onClose={requestClose} />
            <button
              className="sidebar-pill"
              title="New terminal"
              aria-label="New terminal"
              onClick={() => setNewTerminal(true)}
            >
              <Icon name="plus" />
            </button>
            <button
              className="sidebar-pill"
              title="Hide sidebar"
              aria-label="Hide sidebar"
              onClick={() => setSidebarOpen(false)}
            >
              <Icon name="sidebar" />
            </button>
          </div>
          <label className="sidebar-filter">
            <Icon name="search" />
            <input
              aria-label="Filter nodes"
              placeholder="Filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </label>
          <nav className="project-tree" aria-label="Projects">
            <button
              className={`project-group ${treeOpen ? '' : 'shut'}`}
              onClick={() => setTreeOpen(!treeOpen)}
              aria-expanded={treeOpen}
            >
              <Icon name="chev" />
              {work.active?.document.name ?? 'My workspace'}
            </button>
            {treeOpen && (
              <>
                <button
                  className={`project-item ${!areaScope && view === 'canvas' ? 'on' : ''}`}
                  onClick={() => {
                    useCanvas.getState().setAreaScope(null);
                    setView('canvas');
                  }}
                >
                  <Icon name="folder" />
                  <span>Whole canvas</span>
                  <small>
                    <Icon name="terminal" />
                    {nodes.filter((n) => n.kind === 'terminal').length}
                  </small>
                </button>
                {catalog?.areas
                  .filter(
                    (a) =>
                      !a.removed &&
                      a.name.toLowerCase().includes(filter.toLowerCase()),
                  )
                  .map((a) => (
                    <button
                      key={a.id}
                      className={`project-item ${areaScope === a.id && view === 'canvas' ? 'on' : ''}`}
                      onClick={() => {
                        useCanvas.getState().setAreaScope(a.id, a.directory);
                        setView('canvas');
                      }}
                    >
                      <Icon name="branch" />
                      <span>{a.name}</span>
                      <small>
                        {
                          nodes.filter(
                            (n) => n.areaId === a.id && n.kind === 'terminal',
                          ).length
                        }
                      </small>
                    </button>
                  ))}
                {nodes
                  .filter(
                    (n) =>
                      (!areaScope || n.areaId === areaScope) &&
                      n.title.toLowerCase().includes(filter.toLowerCase()),
                  )
                  .map((n) => (
                    <button
                      key={n.id}
                      className={`project-item node-tree-item ${selected.includes(n.id) && view === 'canvas' ? 'selected' : ''}`}
                      onClick={() => focusNode(n.id)}
                    >
                      <Icon name={nodeIcon(n)} />
                      <span>{n.title}</span>
                    </button>
                  ))}
              </>
            )}
          </nav>
          <nav className="view-navigation" aria-label="Views">
            <small>{work.active?.document.name ?? 'Local'} workspace</small>
            {views.map(([id, label, icon]) => (
              <button
                key={id}
                className={view === id ? 'on' : ''}
                aria-current={view === id ? 'page' : undefined}
                onClick={() => {
                  setView(id);
                  if (compactLayout) setSidebarOpen(false);
                }}
              >
                <Icon name={icon} />
                <span>{label}</span>
                {id === 'review' &&
                  Boolean(
                    teamData?.snapshot.board.tasks.some(
                      (t) => t.state === 'review',
                    ),
                  ) && (
                    <b>
                      {
                        teamData?.snapshot.board.tasks.filter(
                          (t) => t.state === 'review',
                        ).length
                      }
                    </b>
                  )}
                {id === 'team' && teamAttention && (
                  <i className="attention-dot" />
                )}
              </button>
            ))}
          </nav>
        </aside>
        <main className="main-workspace">
          {!sidebarOpen && (
            <div className="window-chrome-floating">
              <WindowControls onClose={requestClose} />
              <button
                className="sidebar-reopen"
                aria-label="Show sidebar"
                aria-controls="workspace-navigation"
                aria-expanded={false}
                title="Show sidebar"
                onClick={() => setSidebarOpen(true)}
              >
                <Icon name="sidebar" />
              </button>
            </div>
          )}
          <div
            className="creation-toolbar"
            role="toolbar"
            aria-label="Canvas tools"
          >
            <button
              title="Select"
              aria-label="Select"
              className={!drawOpen ? 'on' : ''}
              onClick={() => {
                setDrawOpen(false);
                window.dispatchEvent(
                  new CustomEvent('canvas-tool', { detail: 'select' }),
                );
              }}
            >
              <Icon name="select" />
            </button>
            <button
              title="New agent"
              aria-label="New agent"
              onClick={() => setNewAgent(true)}
            >
              <Icon name="agent" />
            </button>
            <button
              title="New terminal"
              aria-label="New terminal"
              onClick={() => setNewTerminal(true)}
            >
              <Icon name="terminal" />
            </button>
            <button title="New note" aria-label="New note" onClick={addNote}>
              <Icon name="note" />
            </button>
            <button
              title="New portal"
              aria-label="New portal"
              onClick={() => add('browser')}
            >
              <Icon name="browser" />
            </button>
            <button
              title="Draw a shape"
              aria-label="Draw a shape"
              aria-pressed={drawOpen}
              className={drawOpen ? 'on' : ''}
              onClick={() => {
                setDrawOpen(!drawOpen);
                if (drawOpen)
                  window.dispatchEvent(
                    new CustomEvent('canvas-tool', { detail: 'select' }),
                  );
              }}
            >
              <Icon name="shapes" />
            </button>
          </div>
          <div className="workspace-actions">
            <button
              className="workspace-switch"
              aria-label={`Manage workspaces: ${work.active?.document.name ?? 'Workspace'}`}
              title="Manage workspaces"
              onClick={() => setWorkspacesOpen(true)}
            >
              <Icon name="layers" />
              <span>{work.active?.document.name ?? 'Workspace'}</span>
            </button>
            <button
              aria-label="Toggle inspector"
              title="Toggle inspector"
              aria-pressed={inspectorOpen}
              onClick={() => setInspectorOpen(!inspectorOpen)}
            >
              <Icon name="inspector" />
            </button>
            <button
              aria-label={
                run?.state === 'running'
                  ? 'Pause dispatch; running tasks continue'
                  : 'Open team run'
              }
              title={
                run?.state === 'running'
                  ? 'Pause dispatch; running tasks continue'
                  : 'Open team run'
              }
              disabled={teamControlBusy}
              onClick={() => void toggleDispatch()}
            >
              <Icon name={run?.state === 'running' ? 'pause' : 'team'} />
              <span>
                {run?.state === 'running' ? 'Pause dispatch' : 'Team run'}
              </span>
            </button>
            <button
              title="Command palette (Ctrl+K)"
              aria-label="Command palette"
              onClick={() => setPaletteOpen(true)}
            >
              <Icon name="command" />
              <span>Ctrl K</span>
            </button>
            <ThemeControl compact />
          </div>
          {inspectorOpen && view === 'canvas' && (
            <aside className="inspector" aria-label="Node inspector">
              <header className="inspector-heading">
                <h2>Inspector</h2>
                <button
                  aria-label="Close inspector"
                  onClick={() => setInspectorOpen(false)}
                >
                  <Icon name="close" />
                </button>
              </header>
              {focus ? (
                <>
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
                  {focus.kind === 'terminal' && (
                    <TerminalActivity id={focus.id} />
                  )}
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
                      title="Undo (Ctrl+Z)"
                      disabled={!past.length}
                      onClick={() => useCanvas.getState().undo()}
                    >
                      <Icon name="undo" />
                    </button>
                    <button
                      title="Redo (Ctrl+Shift+Z)"
                      disabled={!future.length}
                      onClick={() => useCanvas.getState().redo()}
                    >
                      <Icon name="redo" />
                    </button>
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
                </>
              ) : (
                <p className="inspector-empty">
                  Select a node to see its details, role, and activity.
                </p>
              )}
            </aside>
          )}
          {view === 'canvas' && (
            <Canvas
              disabled={busy}
              insets={() => {
                const root = shell.current!;
                return panelInsets(
                  root.getBoundingClientRect(),
                  sidebarOpen
                    ? root.querySelector('.sidebar')?.getBoundingClientRect()
                    : undefined,
                  inspectorOpen
                    ? root.querySelector('.inspector')?.getBoundingClientRect()
                    : undefined,
                );
              }}
              onRestart={setRestartId}
              onConnections={() => setConnectionsOpen(true)}
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
          )}
          {view === 'notes' && (
            <NotesPage
              workspaceId={work.active?.document.id}
              onNew={addNote}
              onFocus={focusNode}
            />
          )}
          {view === 'activity' && <ActivityPage data={teamData} />}
          {view === 'settings' && (
            <SettingsPage
              appearance={appearance}
              onChange={setAppearance}
              workspaceName={work.active?.document.name ?? 'Workspace'}
              onWorkspaces={() => setWorkspacesOpen(true)}
              onShortcuts={() => setHelp(true)}
              onPresets={() => setAgentPresets(true)}
            />
          )}
          {['tasks', 'team', 'areas', 'review'].includes(view) &&
            !work.active && (
              <div className="design-page">
                <div className="page-width">
                  <PageHeading
                    title={views.find(([id]) => id === view)?.[1] ?? ''}
                    description="Open a desktop workspace to use your saved work."
                  />
                  <section className="design-card page-empty">
                    <Icon name="folder" />
                    <h2>Your workspace, ready for work.</h2>
                    <p>
                      Tasks, team runs and Git reviews use a local workspace
                      folder.
                    </p>
                    <button onClick={() => setWorkspacesOpen(true)}>
                      Choose workspace
                    </button>
                  </section>
                </div>
              </div>
            )}
          <footer className="statusbar">
            <span>
              <span className="local-dot" /> Local workspace
            </span>
            <span>
              {nodes.length} nodes <b>·</b> {selected.length} selected
            </span>
            <button
              className="save-status"
              title="Save workspace"
              disabled={!work.active}
              onClick={() =>
                void workspace.save().catch((error) => setNotice(String(error)))
              }
            >
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
            </button>
          </footer>
        </main>
      </div>
      {paletteOpen && (
        <CommandPalette
          actions={paletteActions}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {noteState.error && work.phase === 'ready' && (
        <div className="notes-warning" role="status">
          {noteState.error}
        </div>
      )}
      {newTerminal && (
        <NewTerminal
          defaultCwd={areaDirectory || work.active?.folder}
          onClose={() => {
            setNewTerminal(false);
            setView('canvas');
          }}
        />
      )}
      {newAgent && (
        <NewTerminal
          agentMode
          defaultCwd={areaDirectory || work.active?.folder}
          onClose={() => {
            setNewAgent(false);
            setView('canvas');
          }}
        />
      )}
      {agentPresets && <AgentPresets onClose={() => setAgentPresets(false)} />}
      {teamOpen && work.active && !busy && (
        <TeamPanel
          embedded
          key={work.active.document.id}
          workspaceId={work.active.document.id}
          onClose={() => setTeamOpen(false)}
          onRecruit={() => {
            setTeamOpen(false);
            setNewAgent(true);
          }}
          onEdit={(node) => {
            setTeamOpen(false);
            setRestartId(node.id);
          }}
          onAreas={(id) => {
            setTeamOpen(false);
            setTeamAreaScope(id);
            setAreasOpen(true);
          }}
          onTasks={() => {
            setTeamOpen(false);
            setTasksOpen(true);
          }}
        />
      )}
      {teamAttention && !teamOpen && (
        <button className="pending-badge" onClick={() => setTeamOpen(true)}>
          Team needs attention: {teamAttention}
        </button>
      )}
      {view === 'review' && work.active && !busy && (
        <ReviewPage
          key={work.active.document.id}
          workspaceId={work.active.document.id}
          initialAreaId={reviewAreaId}
          runId={teamAreaScope}
          onAreas={() => setView('areas')}
          onScope={(area) => {
            useCanvas.getState().setAreaScope(area.id, area.directory);
            setView('canvas');
          }}
        />
      )}
      {areasOpen && work.active && !busy && (
        <AreasPanel
          embedded
          onReview={(id) => {
            setReviewAreaId(id);
            setView('review');
          }}
          runId={teamAreaScope}
          key={work.active.document.id}
          workspaceId={work.active.document.id}
          onClose={() => {
            setAreasOpen(false);
            setTeamAreaScope(undefined);
          }}
          onScope={(area) =>
            useCanvas.getState().setAreaScope(area?.id ?? null, area?.directory)
          }
          onLaunch={(area) => {
            setAreasOpen(false);
            setLaunchArea(area);
            useCanvas.getState().setAreaScope(area.id, area.directory);
          }}
        />
      )}
      {launchArea && (
        <NewTerminal
          agentMode
          areaId={launchArea.id}
          defaultCwd={launchArea.directory}
          onClose={() => setLaunchArea(undefined)}
        />
      )}
      {tasksOpen && work.active && !busy && (
        <TaskBoard
          embedded
          initialSelected={taskSelection}
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
            <Icon name="close" />
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
              <Icon name="close" />
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
