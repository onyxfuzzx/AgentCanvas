import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { useCanvas } from '../canvas/store';
import { NoteNode } from '../notes/NoteNode';
import { notes } from '../notes/runtime';
import { ThemeControl } from './ThemeControl';
import { Icon } from './Icon';
import { descriptions, type Appearance } from './design';
import type { TeamSnapshot } from '../team/model';

export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-actions">{children}</div>
    </header>
  );
}
export function NotesPage({
  workspaceId,
  onNew,
  onFocus,
}: {
  workspaceId?: string;
  onNew: () => void;
  onFocus: (id: string) => void;
}) {
  const nodes = useCanvas((s) => s.nodes).filter((n) => n.kind === 'note');
  const [id, setId] = useState('');
  const current = nodes.find((n) => n.id === id) ?? nodes[0];
  const state = useSyncExternalStore(notes.subscribe, notes.snapshot);
  return (
    <div className="design-page">
      <div className="page-width">
        <PageHeading title="Shared notes" description={descriptions.notes}>
          <button
            disabled={!current}
            onClick={() => current && onFocus(current.id)}
          >
            Open on canvas
          </button>
          <button className="primary" onClick={onNew} disabled={!workspaceId}>
            New note
          </button>
        </PageHeading>
        <div className="notes-layout">
          <nav aria-label="Workspace notes">
            {nodes.map((n) => (
              <button
                className={current?.id === n.id ? 'on' : ''}
                key={n.id}
                onClick={() => setId(n.id)}
              >
                <Icon name="note" />
                <span>
                  {n.title}
                  <small>Markdown</small>
                </span>
              </button>
            ))}
          </nav>
          <section className="design-card note-page-editor">
            {current && workspaceId ? (
              <>
                <div className="note-page-heading">
                  <span>{current.relativePath}</span>
                  <span>{state.state}</span>
                </div>
                <NoteNode
                  key={current.id}
                  workspaceId={workspaceId}
                  node={current}
                  visible
                />
              </>
            ) : (
              <div className="page-empty">
                <Icon name="note" />
                <h2>A little shared context.</h2>
                <p>
                  Create a Markdown note to keep briefs and decisions close to
                  your work.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
export function ActivityPage({ data }: { data?: TeamSnapshot }) {
  const [filter, setFilter] = useState('all');
  const run = data?.snapshot.board.orchestration;
  const events = [...(run?.events ?? [])]
    .reverse()
    .filter(
      (e) =>
        filter === 'all' ||
        `${e.kind} ${e.source}`.toLowerCase().includes(filter),
    );
  return (
    <div className="design-page">
      <div className="page-width">
        <PageHeading title="Activity" description={descriptions.activity}>
          <div className="segmented">
            {[
              ['all', 'Everything'],
              ['task', 'Tasks'],
              ['team', 'Team'],
              ['check', 'Checks'],
              ['review', 'Review'],
            ].map(([id, label]) => (
              <button
                key={id}
                className={filter === id ? 'on' : ''}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </PageHeading>
        <p className="page-caption">
          Structured events. No saved terminal transcript.
        </p>
        <section className="design-card">
          {events.length ? (
            events.map((e, i) => (
              <div className="event-row" key={`${e.at}-${i}`}>
                <time>
                  {new Date(e.at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
                <div>
                  <strong>{e.kind.replaceAll('_', ' ')}</strong>
                  <p>{e.detail}</p>
                  <small>
                    {e.source}
                    {e.task ? ` · ${e.task}` : ''}
                  </small>
                </div>
              </div>
            ))
          ) : (
            <div className="page-empty">
              <Icon name="activity" />
              <h2>Quiet for now.</h2>
              <p>Decisions and handoffs land here as your team works.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
export function SettingsPage({
  appearance,
  onChange,
  onWorkspaces,
  onShortcuts,
  onPresets,
  workspaceName,
}: {
  appearance: Appearance;
  onChange: (next: Appearance) => void;
  onWorkspaces: () => void;
  onShortcuts: () => void;
  onPresets: () => void;
  workspaceName: string;
}) {
  const [tab, setTab] = useState('general');
  return (
    <div className="design-page">
      <div className="page-width">
        <PageHeading title="Settings" description={descriptions.settings} />
        <div className="segmented settings-tabs">
          {['general', 'workspace', 'keyboard'].map((t) => (
            <button
              key={t}
              className={t === tab ? 'on' : ''}
              onClick={() => setTab(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <section className="design-card">
          {tab === 'general' ? (
            <>
              <div className="settings-row">
                <span>
                  <b>Appearance</b>
                  <small>A familiar workspace, in your preferred light.</small>
                </span>
                <ThemeControl />
              </div>
              <div className="settings-row">
                <span>
                  <b>Accent colour</b>
                  <small>A small touch of personality.</small>
                </span>
                <div className="accent-options">
                  {[
                    ['Blue', ''],
                    ['Copper', '#c4864a'],
                    ['Sage', '#4f8f62'],
                    ['Violet', '#8a5cf6'],
                  ].map(([name, color]) => (
                    <button
                      title={name}
                      aria-label={name}
                      aria-pressed={appearance.accent === color}
                      key={name}
                      onClick={() => onChange({ ...appearance, accent: color })}
                    >
                      <i style={{ background: color || '#0a7aff' }} />
                    </button>
                  ))}
                </div>
              </div>
              {(
                [
                  [
                    'grid',
                    'Canvas grid',
                    'A subtle guide for a little more order.',
                  ],
                  [
                    'motion',
                    'Animations',
                    'Gentle movement for activity and transitions.',
                  ],
                ] as const
              ).map(([key, label, hint]) => (
                <div className="settings-row" key={key}>
                  <span>
                    <b>{label}</b>
                    <small>{hint}</small>
                  </span>
                  <button
                    className={`design-switch ${appearance[key] ? 'on' : ''}`}
                    role="switch"
                    aria-checked={appearance[key]}
                    aria-label={label}
                    onClick={() =>
                      onChange({ ...appearance, [key]: !appearance[key] })
                    }
                  />
                </div>
              ))}
              <div className="settings-row">
                <span>
                  <b>Default shell</b>
                  <small>Used for new local terminals when available.</small>
                </span>
                <select
                  aria-label="Default shell"
                  value={appearance.shell}
                  onChange={(e) =>
                    onChange({
                      ...appearance,
                      shell: e.target.value as Appearance['shell'],
                    })
                  }
                >
                  <option value="powershell">PowerShell</option>
                  <option value="cmd">Command Prompt</option>
                  <option value="git-bash">Git Bash</option>
                  <option value="wsl">WSL</option>
                </select>
              </div>
              <div className="settings-row">
                <span>
                  <b>Agent presets</b>
                  <small>
                    Providers, saved roles, and launch instructions.
                  </small>
                </span>
                <button onClick={onPresets}>Manage presets</button>
              </div>
            </>
          ) : tab === 'workspace' ? (
            <>
              <div className="settings-row">
                <span>
                  <b>{workspaceName}</b>
                  <small>Layouts and notes stay on your device.</small>
                </span>
                <button onClick={onWorkspaces}>Manage workspaces</button>
              </div>
              <p className="page-caption">
                Workspace changes use the existing validated, atomic save and
                recovery system.
              </p>
            </>
          ) : (
            <>
              <div className="settings-row">
                <span>
                  <b>Keyboard shortcuts</b>
                  <small>
                    Canvas shortcuts leave terminal and text input alone.
                  </small>
                </span>
                <button onClick={onShortcuts}>View shortcuts</button>
              </div>
              {[
                ['Command palette', 'Ctrl K'],
                ['Undo / Redo', 'Ctrl Z / Ctrl Shift Z'],
                ['Fit the canvas', 'Home'],
                ['Pan', 'Space + drag'],
                ['Switch view', '1 – 8'],
              ].map(([label, key]) => (
                <div className="settings-row" key={label}>
                  <span>{label}</span>
                  <kbd>{key}</kbd>
                </div>
              ))}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
