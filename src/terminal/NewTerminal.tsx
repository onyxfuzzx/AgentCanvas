import { readAppearance } from '../ui/design';
import { Icon } from '../ui/Icon';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useCanvas } from '../canvas/store';
import { toWorld, type CanvasNode, type Shell } from '../canvas/model';
import { invoke, isDesktop } from '../native';
import { createSession, closeSession, startSession } from './registry';
import { useDialogFocus } from '../ui/useDialogFocus';
import {
  instructionBytes,
  snapshotProfile,
  type LibraryReply,
} from '../agents/catalog';
import type { AgentSettings } from '../canvas/model';
import { providerExecutables, providerNames } from '../agents/providers';
import { editorInvoke, isEditor } from '../editor';
import type { EditorProjectContext } from '../editor-projects';

type ShellInfo = { id: Shell; label: string; available: boolean };
export function NewTerminal({
  onClose,
  existing,
  defaultCwd = '',
  agentMode = false,
  areaId,
}: {
  onClose: () => void;
  existing?: CanvasNode;
  defaultCwd?: string;
  agentMode?: boolean;
  areaId?: string;
}) {
  const [shells, setShells] = useState<ShellInfo[]>([]);
  const [shell, setShell] = useState<Shell>(
    existing?.shell ?? readAppearance().shell,
  );
  const [cwd, setCwd] = useState(existing?.cwd ?? defaultCwd);
  const managedArea =
    existing?.areaId ?? areaId ?? useCanvas.getState().areaScope ?? undefined;
  const [projects, setProjects] = useState<EditorProjectContext>();
  const [folderBusy, setFolderBusy] = useState(isEditor() && !managedArea);
  const directoryTouched = useRef(Boolean(existing || defaultCwd));
  const mounted = useRef(true);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [submitting, setSubmitting] = useState(false);
  const busy = submitting || folderBusy;
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'shell' | 'agent'>(
    existing?.agent || agentMode ? 'agent' : 'shell',
  );
  const [catalog, setCatalog] = useState<LibraryReply>();
  const [profileId, setProfileId] = useState(existing?.agent ? 'saved' : '');
  const [agent, setAgent] = useState<AgentSettings | undefined>(
    existing?.agent,
  );
  const dialog = useDialogFocus<HTMLFormElement>(() => {
    if (!busy) onClose();
  });
  useEffect(() => {
    mounted.current = true;
    let active = true;
    if (isEditor() && !managedArea) {
      void editorInvoke<EditorProjectContext>('editor_project_context')
        .then((context) => {
          if (!active) return;
          setProjects(context);
          if (!directoryTouched.current) setCwd(context.defaultCwd);
        })
        .catch((error) => {
          if (active) setError(String(error));
        })
        .finally(() => {
          if (active) setFolderBusy(false);
        });
    }
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [managedArea]);
  async function chooseDirectory(path?: string) {
    if (busy || managedArea) return;
    setFolderBusy(true);
    setError('');
    try {
      if (path !== undefined) {
        const context = await editorInvoke<EditorProjectContext>(
          'editor_select_project',
          { path },
        );
        if (mounted.current) {
          directoryTouched.current = true;
          setProjects(context);
          setCwd(context.defaultCwd);
        }
      } else {
        const picked = await editorInvoke<string | null>(
          'editor_pick_directory',
          { cwd },
        );
        if (mounted.current && picked !== null) {
          directoryTouched.current = true;
          setCwd(picked);
        }
      }
    } catch (error) {
      if (mounted.current) setError(String(error));
    } finally {
      if (mounted.current) setFolderBusy(false);
    }
  }
  useEffect(() => {
    if (!isDesktop()) {
      setError('Terminals need the Windows desktop host. Use npm run desktop.');
      return;
    }
    let active = true;
    void invoke<LibraryReply>('agent_catalog')
      .then((next) => {
        if (!active) return;
        setCatalog(next);
        if (!existing?.agent && next.library.profiles[0]) {
          setProfileId(next.library.profiles[0].id);
          setAgent(snapshotProfile(next.library, next.library.profiles[0]));
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    void invoke<ShellInfo[]>('shells')
      .then((result) => {
        if (active) {
          setShells(result);
          const first =
            result.find(
              (s) => s.id === readAppearance().shell && s.available,
            ) ?? result.find((s) => s.available);
          if (first && !existing) setShell(first.id);
        }
      })
      .catch((error) => {
        if (active) setError(String(error));
      });
    return () => {
      active = false;
    };
  }, [existing]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (
      mode === 'agent' &&
      (!agent || instructionBytes(agent.instructions) > 4096)
    ) {
      setError(
        'Choose an agent preset and keep instructions within 4096 UTF-8 bytes.',
      );
      return;
    }
    const s = useCanvas.getState();
    if (!existing && s.nodes.length >= 500) {
      setError('A workspace supports up to 500 nodes.');
      return;
    }
    if (
      !existing &&
      s.nodes.filter((n) => n.kind === 'terminal').length >= 20
    ) {
      setError('This session supports up to 20 terminals.');
      return;
    }
    const canvas =
      document.querySelector('.canvas') ??
      document.querySelector('.main-workspace')!;
    const sidebarWidth = document.querySelector('.sidebar[inert]') ? 0 : 260;
    const point = toWorld(
      {
        x:
          sidebarWidth +
          Math.max(
            20,
            (canvas.clientWidth - sidebarWidth - 660 * s.viewport.zoom) / 2,
          ),
        y: Math.max(100, (canvas.clientHeight - 430 * s.viewport.zoom) / 2),
      },
      s.viewport,
    );
    const node: CanvasNode = {
      id: existing?.id ?? crypto.randomUUID(),
      kind: 'terminal',
      title:
        title.trim() ||
        (mode === 'agent'
          ? agent?.profileName
          : shells.find((s) => s.id === shell)?.label) ||
        'Terminal',
      shell: mode === 'agent' ? 'cmd' : shell,
      ...(mode === 'agent' ? { agent } : {}),
      cwd: cwd.trim(),
      ...(managedArea ? { areaId: managedArea } : {}),
      color: '#708f7c',
      ...point,
      width: 660,
      height: 430,
      z: Math.max(0, ...s.nodes.map((n) => n.z)) + 1,
      ...(existing
        ? {
            x: existing.x,
            y: existing.y,
            width: existing.width,
            height: existing.height,
            color: existing.color,
          }
        : {}),
    };
    try {
      setSubmitting(true);
      if (existing) await closeSession(existing.id);
      createSession(node);
      if (existing) {
        s.patch({
          [node.id]: { ...node, agent: mode === 'agent' ? agent : undefined },
        });
        useCanvas.getState().setTerminalLaunch(node);
      } else s.add(node);
      void startSession(node).catch(() => {});
      onClose();
    } catch (error) {
      setError(String(error));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div
      className="modal-backdrop"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <form
        ref={dialog}
        tabIndex={-1}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terminal-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void submit(e)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) onClose();
        }}
      >
        <button
          type="button"
          className="dialog-close"
          aria-label="Cancel new terminal"
          onClick={onClose}
          disabled={busy}
        >
          <Icon name="close" />
        </button>
        <span className="eyebrow">A NEW PLACE TO WORK</span>
        <h2 id="terminal-title">
          {existing
            ? 'Edit and restart.'
            : mode === 'agent'
              ? 'Start an agent.'
              : 'Start a terminal.'}
        </h2>
        <p>
          {managedArea
            ? 'Managed task area. The checkout directory is validated before launch.'
            : 'Shared directory execution. This launch has no managed Git isolation guarantee.'}
        </p>
        <label htmlFor="launch-mode">Launch</label>
        <select
          id="launch-mode"
          value={mode}
          disabled={busy}
          onChange={(e) => setMode(e.target.value as 'shell' | 'agent')}
        >
          <option value="shell">Shell terminal</option>
          <option value="agent">Coding agent</option>
        </select>
        {mode === 'agent' ? (
          <>
            <label htmlFor="launch-profile">Agent preset</label>
            <select
              id="launch-profile"
              value={profileId}
              disabled={busy}
              onChange={(e) => {
                const id = e.target.value;
                setProfileId(id);
                if (id === 'saved') setAgent(existing?.agent);
                else {
                  const p = catalog?.library.profiles.find((p) => p.id === id);
                  if (p && catalog)
                    setAgent(snapshotProfile(catalog.library, p));
                }
              }}
            >
              {existing?.agent && (
                <option value="saved">
                  Saved launch settings · {existing.agent.profileName}
                </option>
              )}
              {catalog?.library.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {providerNames[p.provider]}
                </option>
              ))}
            </select>
            {!catalog?.library.profiles.length && !existing?.agent && (
              <p>Create a preset in Agent presets first.</p>
            )}
            {agent && (
              <>
                <label htmlFor="launch-role">Role name</label>
                <input
                  id="launch-role"
                  required
                  maxLength={80}
                  disabled={busy}
                  value={agent.roleName}
                  onChange={(e) =>
                    setAgent({ ...agent, roleName: e.target.value })
                  }
                />
                <label htmlFor="launch-instructions">
                  Role instructions for this agent
                </label>
                <textarea
                  id="launch-instructions"
                  rows={4}
                  disabled={busy}
                  value={agent.instructions}
                  onChange={(e) =>
                    setAgent({ ...agent, instructions: e.target.value })
                  }
                />
                <small
                  className={
                    instructionBytes(agent.instructions) > 4096
                      ? 'error-text'
                      : 'muted'
                  }
                >
                  {instructionBytes(agent.instructions)} / 4096 UTF-8 bytes ·{' '}
                  {agent.provider}
                </small>
                <label htmlFor="launch-executable">
                  Native executable <span className="muted">(optional)</span>
                </label>
                <input
                  id="launch-executable"
                  disabled={busy}
                  value={agent.executable ?? ''}
                  placeholder={`Auto-detect ${providerExecutables[agent.provider]}`}
                  onChange={(e) =>
                    setAgent({
                      ...agent,
                      executable: e.target.value || undefined,
                    })
                  }
                />
                {agent.provider === 'antigravity' && (
                  <small className="muted">
                    Starting Antigravity sends an interactive role briefing. It
                    asks the agent to wait for your assignment.
                  </small>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <label htmlFor="shell">Shell</label>
            <select
              autoFocus
              id="shell"
              value={shell}
              disabled={busy}
              onChange={(e) => setShell(e.target.value as Shell)}
            >
              {shells.length ? (
                shells.map((s) => (
                  <option key={s.id} value={s.id} disabled={!s.available}>
                    {s.label}
                    {!s.available ? ' · unavailable' : ''}
                  </option>
                ))
              ) : (
                <option value="powershell">PowerShell</option>
              )}
            </select>
          </>
        )}
        <label htmlFor="terminal-name">
          {mode === 'agent' ? 'Agent name' : 'Title'}{' '}
          <span className="muted">(optional)</span>
        </label>
        <input
          id="terminal-name"
          value={title}
          disabled={busy}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. API agent"
        />
        {isEditor() && !managedArea && Boolean(projects?.folders.length) && (
          <>
            <label htmlFor="terminal-project">Project folder</label>
            <select
              id="terminal-project"
              disabled={busy}
              value={
                projects?.folders.some((folder) => folder.path === cwd)
                  ? cwd
                  : ''
              }
              onChange={(event) => void chooseDirectory(event.target.value)}
            >
              <option value="" disabled>
                Choose an open project folder
              </option>
              {projects?.folders.map((folder) => (
                <option key={folder.path} value={folder.path}>
                  {folder.name} · {folder.path}
                </option>
              ))}
            </select>
          </>
        )}
        <label htmlFor="terminal-cwd">Working directory</label>
        <input
          id="terminal-cwd"
          value={cwd}
          disabled={busy || Boolean(managedArea)}
          onChange={(e) => {
            directoryTouched.current = true;
            setCwd(e.target.value);
          }}
          placeholder="Leave blank for your home folder"
        />
        {isEditor() && !managedArea && (
          <div className="directory-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => void chooseDirectory()}
            >
              Browse folders…
            </button>
            <small>
              {folderBusy
                ? 'Reading project folders…'
                : projects?.folders.length
                  ? 'The selected project is the default for new terminals and agents in this editor window.'
                  : 'Open a project folder, browse for a directory, or leave blank for your home folder.'}
            </small>
          </div>
        )}
        {managedArea && (
          <small>
            The managed checkout directory stays fixed for this launch.
          </small>
        )}
        <p>
          {mode === 'agent'
            ? 'Uses the installed CLI and its existing sign-in and approval settings. The agent starts without an assigned task. Reopened agents stay paused until you start them.'
            : 'PowerShell, cmd, WSL and Git Bash use real Windows pseudo-terminals. Commands run with your current user permissions.'}
        </p>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary-button"
          disabled={
            busy ||
            !isDesktop() ||
            (mode === 'agent'
              ? !agent || instructionBytes(agent.instructions) > 4096
              : !shells.some((s) => s.id === shell && s.available))
          }
        >
          {submitting
            ? 'Starting…'
            : mode === 'agent'
              ? 'Start agent →'
              : existing
                ? 'Restart shell →'
                : 'Create terminal →'}
        </button>
      </form>
    </div>
  );
}
