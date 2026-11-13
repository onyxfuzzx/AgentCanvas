import { useEffect, useState, type FormEvent } from 'react';
import type { AgentProvider } from '../canvas/model';
import { invoke, isDesktop } from '../native';
import { useDialogFocus } from '../ui/useDialogFocus';
import {
  instructionBytes,
  type LibraryReply,
  type Availability,
} from './catalog';

export function AgentPresets({ onClose }: { onClose: () => void }) {
  const [reply, setReply] = useState<LibraryReply>();
  const [providers, setProviders] = useState<Availability[]>([]);
  const [roleId, setRoleId] = useState('');
  const [profileId, setProfileId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const dialog = useDialogFocus<HTMLFormElement>(() => {
    if (!busy) onClose();
  });
  const load = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const [next, available] = await Promise.all([
        invoke<LibraryReply>('agent_catalog'),
        invoke<Availability[]>('agent_providers'),
      ]);
      setReply(next);
      setProviders(available);
      setRoleId(next.library.roles[0]?.id ?? '');
      setProfileId(next.library.profiles[0]?.id ?? '');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (isDesktop()) void load();
    else setError('Agent presets need the desktop app.');
  }, []);
  const library = reply?.library;
  const role = library?.roles.find((r) => r.id === roleId);
  const profile = library?.profiles.find((p) => p.id === profileId);
  const patchRole = (patch: Partial<NonNullable<typeof role>>) => {
    if (reply)
      setReply({
        ...reply,
        library: {
          ...reply.library,
          roles: reply.library.roles.map((r) =>
            r.id === roleId ? { ...r, ...patch } : r,
          ),
        },
      });
  };
  const patchProfile = (patch: Partial<NonNullable<typeof profile>>) => {
    if (reply)
      setReply({
        ...reply,
        library: {
          ...reply.library,
          profiles: reply.library.profiles.map((p) =>
            p.id === profileId ? { ...p, ...patch } : p,
          ),
        },
      });
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!reply) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const next = await invoke<LibraryReply>('agent_catalog_save', {
        expected: reply.fingerprint,
        library: reply.library,
      });
      setReply(next);
      setMessage('Saved. Existing agent nodes keep their own launch settings.');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
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
        className="dialog agent-library"
        role="dialog"
        aria-modal="true"
        aria-labelledby="presets-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void save(e)}
      >
        <button
          type="button"
          className="dialog-close"
          aria-label="Close agent presets"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
        <span className="eyebrow">YOUR LOCAL AGENT LIBRARY</span>
        <h2 id="presets-title">Agent presets.</h2>
        <p>
          Reuse a CLI and role when creating agents. Each node saves a copy. CLI
          sign-in and approval settings stay with the installed CLI.
        </p>
        {providers.map((p) => (
          <p
            className="agent-detection"
            key={p.provider}
            title={p.path || p.error || ''}
          >
            <strong>{p.provider}</strong> ·{' '}
            {p.available ? 'Native CLI detected' : 'Not detected'}
            <small>{p.path || p.error}</small>
          </p>
        ))}
        {reply?.recovered && (
          <p role="status">
            Loaded the last-good backup. Saving will preserve the corrupt
            original.
          </p>
        )}
        {library && (
          <fieldset disabled={busy} className="agent-fields">
            <div className="agent-library-columns">
              <section>
                <h3>Roles</h3>
                <label htmlFor="library-role">Role</label>
                <select
                  id="library-role"
                  value={roleId}
                  onChange={(e) => {
                    setRoleId(e.target.value);
                    setMessage('');
                  }}
                >
                  {library.roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <div className="agent-actions">
                  <button
                    type="button"
                    disabled={library.roles.length >= 32}
                    onClick={() => {
                      const id = crypto.randomUUID();
                      setReply({
                        ...reply!,
                        library: {
                          ...library,
                          roles: [
                            ...library.roles,
                            { id, name: 'New role', instructions: '' },
                          ],
                        },
                      });
                      setRoleId(id);
                      setMessage('');
                    }}
                  >
                    Add role
                  </button>
                  <button
                    type="button"
                    disabled={
                      !role || library.profiles.some((p) => p.roleId === roleId)
                    }
                    title="A role must be unused by presets before removal"
                    onClick={() => {
                      const roles = library.roles.filter(
                        (r) => r.id !== roleId,
                      );
                      setReply({ ...reply!, library: { ...library, roles } });
                      setRoleId(roles[0]?.id ?? '');
                      setMessage('');
                    }}
                  >
                    Remove
                  </button>
                </div>
                {role && (
                  <>
                    <label htmlFor="role-name">Role name</label>
                    <input
                      id="role-name"
                      required
                      maxLength={80}
                      value={role.name}
                      onChange={(e) => patchRole({ name: e.target.value })}
                    />
                    <label htmlFor="role-instructions">Role instructions</label>
                    <textarea
                      id="role-instructions"
                      rows={7}
                      value={role.instructions}
                      onChange={(e) =>
                        patchRole({ instructions: e.target.value })
                      }
                    />
                    <small
                      className={
                        instructionBytes(role.instructions) > 4096
                          ? 'error-text'
                          : 'muted'
                      }
                    >
                      {instructionBytes(role.instructions)} / 4096 UTF-8 bytes
                    </small>
                  </>
                )}
              </section>
              <section>
                <h3>Launch presets</h3>
                <label htmlFor="library-profile">Preset</label>
                <select
                  id="library-profile"
                  value={profileId}
                  onChange={(e) => {
                    setProfileId(e.target.value);
                    setMessage('');
                  }}
                >
                  {library.profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <div className="agent-actions">
                  <button
                    type="button"
                    disabled={
                      !library.roles.length || library.profiles.length >= 32
                    }
                    onClick={() => {
                      const id = crypto.randomUUID();
                      setReply({
                        ...reply!,
                        library: {
                          ...library,
                          profiles: [
                            ...library.profiles,
                            {
                              id,
                              name: 'New preset',
                              provider: 'codex',
                              roleId: roleId || library.roles[0].id,
                            },
                          ],
                        },
                      });
                      setProfileId(id);
                      setMessage('');
                    }}
                  >
                    Add preset
                  </button>
                  <button
                    type="button"
                    disabled={!profile}
                    onClick={() => {
                      const profiles = library.profiles.filter(
                        (p) => p.id !== profileId,
                      );
                      setReply({
                        ...reply!,
                        library: { ...library, profiles },
                      });
                      setProfileId(profiles[0]?.id ?? '');
                      setMessage('');
                    }}
                  >
                    Remove
                  </button>
                </div>
                {profile && (
                  <>
                    <label htmlFor="profile-name">Preset name</label>
                    <input
                      id="profile-name"
                      required
                      maxLength={80}
                      value={profile.name}
                      onChange={(e) => patchProfile({ name: e.target.value })}
                    />
                    <label htmlFor="profile-provider">CLI</label>
                    <select
                      id="profile-provider"
                      value={profile.provider}
                      onChange={(e) =>
                        patchProfile({
                          provider: e.target.value as AgentProvider,
                          executable: undefined,
                        })
                      }
                    >
                      <option value="codex">Codex</option>
                      <option value="claude">Claude Code</option>
                    </select>
                    <label htmlFor="profile-role">Assigned role</label>
                    <select
                      id="profile-role"
                      value={profile.roleId}
                      onChange={(e) => patchProfile({ roleId: e.target.value })}
                    >
                      {library.roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <label htmlFor="profile-executable">
                      Native executable{' '}
                      <span className="muted">(optional)</span>
                    </label>
                    <input
                      id="profile-executable"
                      value={profile.executable ?? ''}
                      placeholder={`Auto-detect ${profile.provider}.exe`}
                      onChange={(e) =>
                        patchProfile({
                          executable: e.target.value || undefined,
                        })
                      }
                    />
                    <small>
                      Use an absolute path ending in {profile.provider}.exe.
                    </small>
                  </>
                )}
              </section>
            </div>
          </fieldset>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <div className="agent-actions">
          <button
            type="submit"
            className="primary-button"
            disabled={busy || !library}
          >
            {busy ? 'Working…' : 'Save presets'}
          </button>
          <button
            type="button"
            disabled={busy || !isDesktop()}
            onClick={() => void load()}
          >
            Reload from disk
          </button>
        </div>
      </form>
    </div>
  );
}
