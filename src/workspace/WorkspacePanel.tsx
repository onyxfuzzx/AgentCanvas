import { useState, type FormEvent } from 'react';
import { Icon } from '../ui/Icon';
import { workspace, useWorkspace } from './runtime';
import { useDialogFocus } from '../ui/useDialogFocus';

export function WorkspacePanel({ onClose }: { onClose: () => void }) {
  const state = useWorkspace();
  const [tab, setTab] = useState<'recent' | 'new' | 'open'>('recent');
  const [selected, setSelected] = useState(state.active?.document.id ?? '');
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');
  const [error, setError] = useState('');
  const busy = state.phase === 'switching' || state.phase === 'restoring';
  const dialog = useDialogFocus<HTMLFormElement>(() => {
    if (!busy) onClose();
  });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (tab === 'new') await workspace.create(name, folder);
      else if (tab === 'open') await workspace.openFolder(folder);
      else await workspace.switchTo(selected);
      onClose();
    } catch (error) {
      setError(String(error));
    }
  };
  return (
    <div
      className="modal-backdrop"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <form
        ref={dialog}
        tabIndex={-1}
        className="dialog workspace-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspaces-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void submit(e)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) onClose();
        }}
      >
        <button
          type="button"
          className="dialog-close"
          disabled={busy}
          aria-label="Close workspaces"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
        <span className="eyebrow">A PLACE FOR EACH PROJECT</span>
        <h2 id="workspaces-title">Your workspaces.</h2>
        <div className="workspace-tabs">
          {(['recent', 'new', 'open'] as const).map((value) => (
            <button
              type="button"
              key={value}
              disabled={busy}
              className={tab === value ? 'active' : ''}
              onClick={() => {
                setTab(value);
                setError('');
                setFolder('');
              }}
            >
              {value === 'recent'
                ? 'Recent'
                : value === 'new'
                  ? 'New workspace'
                  : 'Open folder'}
            </button>
          ))}
        </div>
        {tab === 'recent' ? (
          <div className="workspace-options">
            {state.entries.length ? (
              state.entries.map((entry) => (
                <button
                  type="button"
                  className={entry.id === selected ? 'chosen' : ''}
                  key={entry.id}
                  disabled={busy}
                  onClick={() => setSelected(entry.id)}
                >
                  <strong>
                    {entry.name}
                    {entry.id === state.active?.document.id ? ' · current' : ''}
                  </strong>
                  <small>{entry.folder}</small>
                </button>
              ))
            ) : (
              <p>No saved workspaces yet. Create one or open its folder.</p>
            )}
          </div>
        ) : (
          <>
            {tab === 'new' && (
              <>
                <label htmlFor="workspace-name">Workspace name</label>
                <input
                  autoFocus
                  id="workspace-name"
                  required
                  maxLength={80}
                  value={name}
                  disabled={busy}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Website redesign"
                />
              </>
            )}
            <label htmlFor="workspace-folder">
              Workspace folder{' '}
              {tab === 'new' && <span className="muted">(optional)</span>}
            </label>
            <input
              id="workspace-folder"
              autoFocus={tab === 'open'}
              required={tab === 'open'}
              disabled={busy}
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder={
                tab === 'new'
                  ? 'Leave blank to create a local folder'
                  : 'C:\\Projects\\My workspace'
              }
            />
            <p>
              {tab === 'new'
                ? `Default location: ${state.defaultFolder || 'app-local workspaces folder'}`
                : 'Choose a folder containing workspace.json. Existing files stay in place.'}
            </p>
          </>
        )}
        <p className="switch-note">
          Switching saves the current layout, stops its shells, and starts fresh
          shells in the selected workspace. Previous commands are never
          replayed.
        </p>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <button
          className="primary-button"
          disabled={
            busy ||
            (tab === 'recent' &&
              (!selected || selected === state.active?.document.id))
          }
        >
          {busy
            ? 'Restoring workspace…'
            : tab === 'new'
              ? 'Create workspace →'
              : tab === 'open'
                ? 'Open workspace →'
                : 'Switch workspace →'}
        </button>
      </form>
    </div>
  );
}
