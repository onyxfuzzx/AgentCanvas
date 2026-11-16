import { useEffect, useRef, useState } from 'react';
import { invoke } from '../native';
import { editorInvoke, isEditor } from '../editor';
import type { EditorProjectContext } from '../editor-projects';
import type { Availability, LibraryReply } from '../agents/catalog';
import { useDialogFocus } from '../ui/useDialogFocus';
import { Icon } from '../ui/Icon';
import { workspace, useWorkspace } from '../workspace/runtime';
import {
  AgentSetup,
  initialProviders,
  providerHelp,
  providerNames,
  setupTroubleshooting,
  type ProviderSetup,
} from './model';
import { completeSetup } from './runtime';

export function SetupWizard({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (action: 'canvas' | 'terminal' | 'agent') => void;
}) {
  const work = useWorkspace();
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [reply, setReply] = useState<LibraryReply>();
  const [configs, setConfigs] = useState<ProviderSetup[]>([]);
  const [checks, setChecks] = useState<Availability[]>([]);
  const [project, setProject] = useState<EditorProjectContext>();
  const [mode, setMode] = useState<'current' | 'recent' | 'new' | 'open'>(
    'current',
  );
  const [selected, setSelected] = useState(work.active?.document.id ?? '');
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');
  const alive = useRef(true);
  const service = useRef<AgentSetup | null>(null);
  if (!service.current)
    service.current = new AgentSetup(
      invoke,
      () => crypto.randomUUID(),
      () => workspace.save(),
      completeSetup,
    );
  const dialog = useDialogFocus<HTMLDivElement>(() => {
    if (!busy) onClose();
  });
  const updateCheck = (check: Availability) => {
    if (alive.current)
      setChecks((items) => [
        ...items.filter((item) => item.provider !== check.provider),
        check,
      ]);
  };
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (error) {
      if (alive.current) setError(String(error));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function load() {
    await run(async () => {
      const data = await service.current!.load();
      if (!alive.current) return;
      setReply(data.reply);
      setConfigs(initialProviders(data.reply, () => crypto.randomUUID()));
      setChecks(data.providers);
      if (isEditor())
        setProject(
          await editorInvoke<EditorProjectContext>('editor_project_context'),
        );
    });
  }
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, []);
  function patch(
    provider: ProviderSetup['provider'],
    values: Partial<ProviderSetup>,
  ) {
    setConfigs((items) =>
      items.map((item) =>
        item.provider === provider ? { ...item, ...values } : item,
      ),
    );
    setChecks((items) => items.filter((item) => item.provider !== provider));
  }
  async function chooseFolder() {
    await run(async () => {
      const result = await editorInvoke<string | null>(
        'editor_pick_directory',
        { cwd: folder },
      );
      if (result !== null && alive.current) setFolder(result);
    });
  }
  async function nextWorkspace() {
    await run(async () => {
      if (mode === 'new') await workspace.create(name.trim(), folder.trim());
      else if (mode === 'open') await workspace.openFolder(folder.trim());
      else if (mode === 'recent') await workspace.switchTo(selected);
      if (!workspace.state.getState().active)
        throw new Error('Choose a canvas workspace before continuing.');
      if (alive.current) setStep(1);
    });
  }
  const selectedConfigs = configs.filter((config) => config.enabled);
  return (
    <div className="modal-backdrop">
      <div
        ref={dialog}
        tabIndex={-1}
        className="dialog setup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
        aria-busy={busy}
      >
        <button
          className="dialog-close"
          type="button"
          disabled={busy}
          aria-label="Set up later"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
        <span className="eyebrow">YOUR LOCAL WORKSPACE</span>
        <h2 id="setup-title">
          {step === 3 ? 'Your setup is saved.' : 'Let’s get you set up.'}
        </h2>
        {step < 3 && (
          <ol className="setup-steps">
            {['Workspace', 'Optional agents', 'Review'].map((label, index) => (
              <li
                key={label}
                aria-current={step === index ? 'step' : undefined}
              >
                <span>{index + 1}</span>
                {label}
              </li>
            ))}
          </ol>
        )}
        {step === 0 && (
          <section>
            <h3>Choose your canvas workspace</h3>
            <p>
              A canvas workspace stores your layout, notes and tasks. Your
              project directory is where terminals and agents work.
            </p>
            <label htmlFor="setup-workspace-mode">Canvas workspace</label>
            <select
              id="setup-workspace-mode"
              disabled={busy}
              value={mode}
              onChange={(event) => {
                setMode(event.target.value as typeof mode);
                setFolder('');
                setError('');
              }}
            >
              <option value="current">
                Use {work.active?.document.name ?? 'current workspace'}
              </option>
              <option value="recent" disabled={!work.entries.length}>
                Use another saved workspace
              </option>
              <option value="new">Create a named workspace</option>
              <option value="open">Open an existing workspace folder</option>
            </select>
            {mode === 'current' && (
              <p className="setup-path">{work.active?.folder}</p>
            )}
            {mode === 'recent' && (
              <>
                <label htmlFor="setup-recent">Saved workspace</label>
                <select
                  id="setup-recent"
                  disabled={busy}
                  value={selected}
                  onChange={(event) => setSelected(event.target.value)}
                >
                  {work.entries.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name} · {entry.folder}
                    </option>
                  ))}
                </select>
              </>
            )}
            {mode === 'new' && (
              <>
                <label htmlFor="setup-workspace-name">Workspace name</label>
                <input
                  id="setup-workspace-name"
                  disabled={busy}
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Website work"
                />
              </>
            )}
            {(mode === 'new' || mode === 'open') && (
              <>
                <label htmlFor="setup-folder">
                  Workspace folder {mode === 'new' ? '(optional)' : ''}
                </label>
                <input
                  id="setup-folder"
                  maxLength={32768}
                  value={folder}
                  disabled={busy}
                  onChange={(event) => setFolder(event.target.value)}
                  placeholder={
                    mode === 'new'
                      ? 'Leave blank to use local app storage'
                      : 'Folder containing workspace.json'
                  }
                />
                {isEditor() && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void chooseFolder()}
                  >
                    Browse folders…
                  </button>
                )}
                <small>
                  {mode === 'new'
                    ? 'A custom folder must be empty. Existing files are preserved.'
                    : 'Choose a saved canvas workspace containing workspace.json.'}
                </small>
              </>
            )}
            {mode !== 'current' && (
              <p>
                Changing workspaces saves the current layout and stops its
                shells.
              </p>
            )}
            {project?.folders.length ? (
              <>
                <label htmlFor="setup-project">
                  Project for new terminals and agents
                </label>
                <select
                  id="setup-project"
                  disabled={busy}
                  value={project.defaultCwd}
                  onChange={(event) =>
                    void run(async () => {
                      setProject(
                        await editorInvoke<EditorProjectContext>(
                          'editor_select_project',
                          { path: event.target.value },
                        ),
                      );
                    })
                  }
                >
                  {project.folders.map((item) => (
                    <option key={item.path} value={item.path}>
                      {item.name} · {item.path}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <p>
                You can choose a working directory when starting a terminal or
                agent.
              </p>
            )}
          </section>
        )}
        {step === 1 && (
          <section>
            <h3>Configure installed coding agents</h3>
            {reply?.recovered && (
              <p role="status">
                The last-good preset backup was loaded. Saving preserves the
                corrupt original.
              </p>
            )}
            <p>
              Agents are optional. Leave both unchecked to use terminals, notes
              and the whiteboard.
            </p>
            {configs.map((config) => {
              const check = checks.find(
                (item) => item.provider === config.provider,
              );
              const profiles =
                reply?.library.profiles.filter(
                  (profile) => profile.provider === config.provider,
                ) ?? [];
              const existing = profiles.some(
                (profile) => profile.id === config.profileId,
              );
              return (
                <section className="setup-provider" key={config.provider}>
                  <label className="setup-choice">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={config.enabled}
                      onChange={(event) =>
                        patch(config.provider, {
                          enabled: event.target.checked,
                        })
                      }
                    />
                    <strong>Configure {providerNames[config.provider]}</strong>
                  </label>
                  <p className="setup-detection">
                    {check
                      ? check.available
                        ? `Executable file found: ${check.path}`
                        : check.error
                      : 'Path not checked'}
                  </p>
                  {config.enabled && (
                    <fieldset disabled={busy}>
                      <label htmlFor={`setup-preset-${config.provider}`}>
                        Preset to configure
                      </label>
                      <select
                        id={`setup-preset-${config.provider}`}
                        value={existing ? config.profileId : 'new'}
                        onChange={(event) => {
                          const profile = profiles.find(
                            (profile) => profile.id === event.target.value,
                          );
                          patch(
                            config.provider,
                            profile
                              ? {
                                  profileId: profile.id,
                                  name: profile.name,
                                  executable: profile.executable ?? '',
                                }
                              : {
                                  profileId: crypto.randomUUID(),
                                  name: `${providerNames[config.provider]} agent`,
                                  executable: '',
                                },
                          );
                        }}
                      >
                        {profiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.name}
                          </option>
                        ))}
                        <option value="new">Create a new preset</option>
                      </select>
                      <label htmlFor={`setup-name-${config.provider}`}>
                        Preset name
                      </label>
                      <input
                        id={`setup-name-${config.provider}`}
                        maxLength={80}
                        value={config.name}
                        onChange={(event) =>
                          patch(config.provider, { name: event.target.value })
                        }
                      />
                      <label htmlFor={`setup-exe-${config.provider}`}>
                        Native executable (optional)
                      </label>
                      <input
                        id={`setup-exe-${config.provider}`}
                        maxLength={4096}
                        value={config.executable}
                        onChange={(event) =>
                          patch(config.provider, {
                            executable: event.target.value,
                          })
                        }
                        placeholder={`Auto-detect ${config.provider}.exe`}
                      />
                      <div className="setup-actions">
                        {isEditor() && (
                          <button
                            type="button"
                            onClick={() =>
                              void run(async () => {
                                const path = await editorInvoke<string | null>(
                                  'editor_pick_executable',
                                  { provider: config.provider },
                                );
                                if (path !== null && alive.current)
                                  patch(config.provider, { executable: path });
                              })
                            }
                          >
                            Browse executable…
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            void run(async () =>
                              updateCheck(
                                await service.current!.inspect(config),
                              ),
                            )
                          }
                        >
                          Check executable
                        </button>
                      </div>
                      <p>
                        Authentication and CLI version: not checked. Sign in
                        using the installed CLI before starting an agent. Its
                        existing approval settings stay in effect.
                      </p>
                    </fieldset>
                  )}
                  <details>
                    <summary>Installation and launch troubleshooting</summary>
                    <p>{setupTroubleshooting('native CLI not found')}</p>
                    <p>
                      If the CLI opens but cannot authenticate, complete sign-in
                      in its own terminal. If it exits during launch, check its
                      error in the terminal and verify this workspace directory
                      exists.
                    </p>
                    {isEditor() ? (
                      <div className="setup-actions">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await editorInvoke('editor_open_external', {
                                url: providerHelp[config.provider].install,
                              });
                            })
                          }
                        >
                          Official Windows setup guide
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await editorInvoke('editor_open_external', {
                                url: providerHelp[config.provider].auth,
                              });
                            })
                          }
                        >
                          Official sign-in guide
                        </button>
                      </div>
                    ) : (
                      <p className="setup-path">
                        {providerHelp[config.provider].install}
                        <br />
                        {providerHelp[config.provider].auth}
                      </p>
                    )}
                  </details>
                </section>
              );
            })}
            <p>
              Checks inspect local files. Saving setup does not install
              software, sign in, start agents or submit tasks.
            </p>
          </section>
        )}
        {step === 2 && (
          <section>
            <h3>Review your choices</h3>
            <dl className="setup-summary">
              <dt>Canvas workspace</dt>
              <dd>
                {work.active?.document.name}
                <span className="setup-path">{work.active?.folder}</span>
              </dd>
              <dt>New launch directory</dt>
              <dd>
                {project?.defaultCwd ||
                  'Choose when launching; blank uses your home folder'}
              </dd>
              <dt>Agent presets</dt>
              <dd>
                {selectedConfigs.length
                  ? selectedConfigs.map((config) => (
                      <p key={config.provider}>
                        <strong>{config.name}</strong> ·{' '}
                        {providerNames[config.provider]}
                        <span className="setup-path">
                          {config.executable.trim() ||
                            'Auto-detect native executable at launch'}
                        </span>
                      </p>
                    ))
                  : 'No agent changes. Continue with terminals.'}
              </dd>
            </dl>
            <p>
              Existing agent nodes keep their saved launch settings. Selected
              executables will be checked again before the presets are saved.
            </p>
          </section>
        )}
        {step === 3 && (
          <section>
            <p>
              Your workspace and selected presets are saved. Start a terminal to
              use your project, or choose a preset when starting an agent.
            </p>
            <div className="setup-actions">
              <button type="button" onClick={() => onDone('terminal')}>
                Open terminal form
              </button>
              {selectedConfigs.length > 0 && (
                <button type="button" onClick={() => onDone('agent')}>
                  Open agent form
                </button>
              )}
              <button
                type="button"
                className="primary-button"
                onClick={() => onDone('canvas')}
              >
                Go to canvas
              </button>
            </div>
          </section>
        )}
        {error && (
          <div role="alert" className="setup-error">
            <p className="error-text">{error}</p>
            <p>{setupTroubleshooting(error)}</p>
            <button type="button" disabled={busy} onClick={() => void load()}>
              Reload setup data
            </button>
          </div>
        )}
        {busy && <p role="status">Checking local setup…</p>}
        {step < 3 && (
          <footer className="setup-actions">
            <button type="button" disabled={busy} onClick={onClose}>
              Set up later
            </button>
            {step > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setStep(step === 2 ? 1 : 0);
                  setError('');
                }}
              >
                Back
              </button>
            )}
            {step === 0 ? (
              <button
                type="button"
                className="primary-button"
                disabled={
                  busy ||
                  !reply ||
                  (mode === 'new' && !name.trim()) ||
                  (mode === 'open' && !folder.trim()) ||
                  (mode === 'recent' && !selected)
                }
                onClick={() => void nextWorkspace()}
              >
                Continue
              </button>
            ) : step === 1 ? (
              <button
                type="button"
                className="primary-button"
                disabled={
                  busy ||
                  !reply ||
                  selectedConfigs.some((config) => !config.name.trim())
                }
                onClick={() => {
                  setStep(2);
                  setError('');
                }}
              >
                Review setup
              </button>
            ) : (
              <button
                type="button"
                className="primary-button"
                disabled={busy || !reply}
                onClick={() =>
                  void run(async () => {
                    await service.current!.finish(configs, updateCheck);
                    if (alive.current) setStep(3);
                  })
                }
              >
                Save setup
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}
