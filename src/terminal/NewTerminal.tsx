import { useEffect, useState, type FormEvent } from 'react';
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

type ShellInfo = { id: Shell; label: string; available: boolean };
export function NewTerminal({
  onClose,
  existing,
  defaultCwd = '',
  agentMode = false,
}: {
  onClose: () => void;
  existing?: CanvasNode;
  defaultCwd?: string;
  agentMode?: boolean;
}) {
  const [shells, setShells] = useState<ShellInfo[]>([]);
  const [shell, setShell] = useState<Shell>(existing?.shell ?? 'powershell');
  const [cwd, setCwd] = useState(existing?.cwd ?? defaultCwd);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [submitting, setSubmitting] = useState(false);
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
    if (!submitting) onClose();
  });
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
          const first = result.find((s) => s.available);
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
    const canvas = document.querySelector('.canvas')!;
    const point = toWorld(
      {
        x: Math.max(30, (canvas.clientWidth - 660 * s.viewport.zoom) / 2),
        y: Math.max(30, (canvas.clientHeight - 430 * s.viewport.zoom) / 2),
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
          if (e.key === 'Escape' && !submitting) onClose();
        }}
      >
        <button
          type="button"
          className="dialog-close"
          aria-label="Cancel new terminal"
          onClick={onClose}
          disabled={submitting}
        >
          ×
        </button>
        <span className="eyebrow">A NEW PLACE TO WORK</span>
        <h2 id="terminal-title">
          {existing
            ? 'Edit and restart.'
            : mode === 'agent'
              ? 'Start an agent.'
              : 'Start a terminal.'}
        </h2>
        <label htmlFor="launch-mode">Launch</label>
        <select
          id="launch-mode"
          value={mode}
          disabled={submitting}
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
              disabled={submitting}
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
                  {p.name} · {p.provider}
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
                  disabled={submitting}
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
                  disabled={submitting}
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
                  disabled={submitting}
                  value={agent.executable ?? ''}
                  placeholder={`Auto-detect ${agent.provider}.exe`}
                  onChange={(e) =>
                    setAgent({
                      ...agent,
                      executable: e.target.value || undefined,
                    })
                  }
                />
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
              disabled={submitting}
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
          disabled={submitting}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. API agent"
        />
        <label htmlFor="terminal-cwd">Working directory</label>
        <input
          id="terminal-cwd"
          value={cwd}
          disabled={submitting}
          onChange={(e) => setCwd(e.target.value)}
          placeholder="Leave blank for your home folder"
        />
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
            submitting ||
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
