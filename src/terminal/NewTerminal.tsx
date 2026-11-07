import { useEffect, useState, type FormEvent } from 'react';
import { useCanvas } from '../canvas/store';
import { toWorld, type CanvasNode, type Shell } from '../canvas/model';
import { invoke, isDesktop } from '../native';
import { createSession } from './registry';

type ShellInfo = { id: Shell; label: string; available: boolean };
export function NewTerminal({ onClose }: { onClose: () => void }) {
  const [shells, setShells] = useState<ShellInfo[]>([]);
  const [shell, setShell] = useState<Shell>('powershell');
  const [cwd, setCwd] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isDesktop()) {
      setError('Terminals need the Windows desktop host. Use npm run desktop.');
      return;
    }
    let active = true;
    void invoke<ShellInfo[]>('shells')
      .then((result) => {
        if (active) {
          setShells(result);
          const first = result.find((s) => s.available);
          if (first) setShell(first.id);
        }
      })
      .catch((error) => {
        if (active) setError(String(error));
      });
    return () => {
      active = false;
    };
  }, []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const s = useCanvas.getState();
    if (s.nodes.filter((n) => n.kind === 'terminal').length >= 20) {
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
      id: crypto.randomUUID(),
      kind: 'terminal',
      title:
        title.trim() || shells.find((s) => s.id === shell)?.label || 'Terminal',
      shell,
      cwd: cwd.trim(),
      color: '#708f7c',
      ...point,
      width: 660,
      height: 430,
      z: Math.max(0, ...s.nodes.map((n) => n.z)) + 1,
    };
    try {
      const entry = createSession(node);
      s.add(node);
      void entry.session.start().catch(() => {});
      onClose();
    } catch (error) {
      setError(String(error));
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terminal-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <button
          type="button"
          className="dialog-close"
          aria-label="Cancel new terminal"
          onClick={onClose}
        >
          ×
        </button>
        <span className="eyebrow">A NEW PLACE TO WORK</span>
        <h2 id="terminal-title">Start a terminal.</h2>
        <label htmlFor="shell">Shell</label>
        <select
          autoFocus
          id="shell"
          value={shell}
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
        <label htmlFor="terminal-name">
          Title <span className="muted">(optional)</span>
        </label>
        <input
          id="terminal-name"
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. API agent"
        />
        <label htmlFor="terminal-cwd">Working directory</label>
        <input
          id="terminal-cwd"
          value={cwd}
          onChange={(e) => setCwd(e.target.value)}
          placeholder="Leave blank for your home folder"
        />
        <p>
          PowerShell, cmd, WSL and Git Bash use real Windows pseudo-terminals.
          Commands run with your current user permissions.
        </p>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary-button"
          disabled={
            !isDesktop() || !shells.some((s) => s.id === shell && s.available)
          }
        >
          Create terminal →
        </button>
      </form>
    </div>
  );
}
