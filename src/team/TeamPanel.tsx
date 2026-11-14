import { useEffect, useRef, useState } from 'react';
import { invoke } from '../native';
import { useDialogFocus } from '../ui/useDialogFocus';
import { useCanvas } from '../canvas/store';
import type { CanvasNode } from '../canvas/model';
import type { AreaCatalog } from '../areas/model';
import { startSession, stopSession } from '../terminal/registry';
import { teamOperations } from './runtime';
import {
  defaultLimits,
  defaultPermissions,
  parsePlan,
  type Limits,
  type Permissions,
  type Plan,
  type TeamSnapshot,
} from './model';

export function TeamPanel({
  workspaceId,
  onClose,
  onRecruit,
  onEdit,
  onAreas,
  onTasks,
}: {
  workspaceId: string;
  onClose: () => void;
  onRecruit: () => void;
  onEdit: (node: CanvasNode) => void;
  onAreas: (runId: string) => void;
  onTasks: () => void;
}) {
  const [data, setData] = useState<TeamSnapshot>();
  const [areas, setAreas] = useState<AreaCatalog>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [goal, setGoal] = useState('');
  const [coordinator, setCoordinator] = useState('');
  const [limits, setLimits] = useState({ ...defaultLimits });
  const [permissions, setPermissions] = useState({ ...defaultPermissions });
  const [editor, setEditor] = useState('');
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [criteria, setCriteria] = useState('');
  const [agent, setAgent] = useState('');
  const [reviewer, setReviewer] = useState('');
  const [area, setArea] = useState('');
  const [deps, setDeps] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [handoff, setHandoff] = useState('');
  const alive = useRef(true);
  const running = useRef(false);
  const dialog = useDialogFocus<HTMLElement>(() => {
    if (!running.current) onClose();
  });
  const run = data?.snapshot.board.orchestration;
  const tasks = data?.snapshot.board.tasks ?? [];
  const scoped = tasks.filter((t) => run?.tasks.includes(t.id));
  useEffect(() => {
    if (run) {
      setPermissions({ ...run.permissions });
      setLimits({ ...run.limits });
      setGoal(run.goal);
      setCoordinator(run.coordinator ?? '');
    }
  }, [run?.id]);
  async function refresh() {
    const next = await invoke<TeamSnapshot>('team_snapshot', { workspaceId });
    if (alive.current) setData(next);
  }
  useEffect(() => {
    alive.current = true;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        if (!running.current) await refresh();
      } catch (e) {
        if (alive.current) setError(String(e));
      }
      if (!stopped) timer = setTimeout(() => void tick(), 3000);
    };
    void tick();
    void invoke<AreaCatalog>('area_catalog', { workspaceId })
      .then((a) => {
        if (alive.current) setAreas(a);
      })
      .catch((e) => setError(String(e)));
    return () => {
      stopped = true;
      alive.current = false;
      clearTimeout(timer);
    };
  }, [workspaceId]);
  async function perform(action: () => Promise<unknown>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch (e) {
      if (alive.current) setError(String(e));
      try {
        await refresh();
      } catch {
        /* Original error remains visible. */
      }
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const control = (value: Record<string, unknown>) =>
    teamOperations.invoke('team_control', {
      workspaceId,
      revision: data?.snapshot.board.revision,
      control: value,
    });
  async function emergency() {
    setError('');
    try {
      const reply = await teamOperations.invoke<{
        stillStopping: string[];
        saveError: string | null;
      }>('team_emergency_stop', { workspaceId });
      await Promise.all(
        data?.agents
          .filter(
            (a) =>
              scoped.some((t) => t.assignedTo === a.node.id) ||
              run?.coordinator === a.node.id,
          )
          .map((a) => stopSession(a.node.id)) ?? [],
      );
      if (reply.stillStopping.length || reply.saveError)
        setError(`${reply.stillStopping.join('\n')} ${reply.saveError ?? ''}`);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }
  const plan = () =>
    editor.trim()
      ? parsePlan(editor)
      : ({
          goal: goal || run?.goal || '',
          jobs: [],
          checks: [],
          repositories: [],
        } as Plan);
  return (
    <div className="modal-backdrop">
      <section
        className="task-board area-panel team-panel"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-title"
        tabIndex={-1}
      >
        <header>
          <h2 id="team-title">Team run</h2>
          <div className="task-actions">
            <button onClick={() => void emergency()}>Emergency stop</button>
            <button disabled={busy} onClick={onClose}>
              Close
            </button>
          </div>
        </header>
        <p>
          The native scheduler owns execution. Coordinator output is an
          untrusted proposal. Adopt a plan, start existing agents explicitly,
          then choose manual or scoped automatic dispatch. Integration always
          requires user approval.
        </p>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {data?.schedulerError && (
          <p className="error-text" role="alert">
            Scheduler stopped: {data.schedulerError}. Refresh, resolve the
            cause, then explicitly resume.
          </p>
        )}
        {data?.activeCheck && (
          <p role="status">
            Declared check running: {data.activeCheck}. Emergency stop cancels
            it; no passing evidence is recorded on cancellation.
          </p>
        )}
        {run && (
          <div role="status" className="team-status">
            <strong>{run.state}</strong> · {run.reason}
            <p>
              {scoped.filter((t) => t.state === 'running').length}/
              {run.limits.concurrency} active · {run.dispatched}/
              {run.limits.dispatches} dispatches ·{' '}
              {Math.floor(run.elapsedMs / 1000)}/
              {Math.floor(run.limits.runtimeMs / 1000)} seconds ·{' '}
              {data?.agents.filter((a) => a.live).length} live agents. Cost and
              tokens: unknown.
            </p>
          </div>
        )}
        <fieldset disabled={busy}>
          <div className="task-actions">
            <button onClick={() => void perform(refresh)}>Refresh</button>
            <button onClick={onRecruit}>Recruit using preset…</button>
            <button onClick={onTasks}>Tasks & user acceptance…</button>
            {run && (
              <button onClick={() => onAreas(run.id)}>
                Scoped Git areas & evidence…
              </button>
            )}
          </div>
          <div className="task-columns">
            <nav aria-label="Existing agents">
              <h3>Discover and reuse</h3>
              {data?.agents.map((a) => (
                <article key={a.node.id}>
                  <strong>{a.node.title}</strong>
                  <small>
                    {a.node.agent?.provider ?? 'cooperative shell'} ·{' '}
                    {a.node.agent?.roleName ?? 'manual role'} ·{' '}
                    {a.stopping
                      ? 'still stopping'
                      : a.live
                        ? 'live'
                        : 'stopped'}
                  </small>
                  <code>{a.node.id}</code>
                  <p>{a.node.cwd || 'Workspace directory'}</p>
                  <button
                    onClick={() => {
                      useCanvas.getState().select([a.node.id]);
                      onClose();
                    }}
                  >
                    Select node
                  </button>
                  <button onClick={() => onEdit(a.node)}>
                    Role / replace preset…
                  </button>
                  <button
                    onClick={() =>
                      void perform(() =>
                        teamOperations.track(stopSession(a.node.id)),
                      )
                    }
                  >
                    Stop
                  </button>
                  <button
                    disabled={
                      !run?.permissions.launch || !a.node.agent || a.live
                    }
                    onClick={() =>
                      void perform(() =>
                        teamOperations.track(startSession(a.node, workspaceId)),
                      )
                    }
                  >
                    Start run member
                  </button>
                </article>
              ))}
            </nav>
            <div className="task-detail">
              <details open={!run}>
                <summary>Create a bounded run</summary>
                <label>
                  Goal
                  <textarea
                    value={goal}
                    maxLength={4096}
                    onChange={(e) => setGoal(e.target.value)}
                  />
                </label>
                <label>
                  Optional coordinator
                  <select
                    value={coordinator}
                    onChange={(e) => setCoordinator(e.target.value)}
                  >
                    <option value="">Human planning — no coordinator</option>
                    {data?.agents
                      .filter((a) => a.node.agent)
                      .map((a) => (
                        <option key={a.node.id} value={a.node.id}>
                          {a.node.title}
                        </option>
                      ))}
                  </select>
                </label>
                {(Object.keys(limits) as (keyof Limits)[]).map((key) => (
                  <label key={key}>
                    {
                      {
                        concurrency: 'Concurrent tasks (1–4)',
                        queue: 'Queue capacity (1–64)',
                        attempts:
                          'Attempts per task, including review revisions (1–8)',
                        dispatches: 'Total dispatch/iteration limit (1–256)',
                        runtimeMs: 'Elapsed-time limit (milliseconds)',
                        backoffMs: 'Retry backoff (milliseconds)',
                      }[key]
                    }
                    <input
                      type="number"
                      value={limits[key]}
                      onChange={(e) =>
                        setLimits({ ...limits, [key]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
                <button
                  disabled={!data || !goal.trim()}
                  onClick={() =>
                    void perform(() =>
                      control({
                        type: 'new',
                        id: crypto.randomUUID(),
                        goal,
                        coordinator: coordinator || null,
                        limits,
                        permissions,
                      }),
                    )
                  }
                >
                  Create run with these limits
                </button>
              </details>
              <h3>Separate permissions</h3>
              {(Object.keys(permissions) as (keyof Permissions)[]).map(
                (key) => (
                  <label className="team-permission" key={key}>
                    <input
                      type="checkbox"
                      checked={permissions[key]}
                      onChange={(e) =>
                        setPermissions({
                          ...permissions,
                          [key]: e.target.checked,
                        })
                      }
                    />
                    {
                      {
                        dispatch: 'Dispatch adopted tasks',
                        messaging:
                          'Peer messaging for run agents (existing links still apply)',
                        launch: 'Explicitly launch existing run members',
                        provision:
                          'Provision/clean areas in the adopted repository scope',
                        checks: 'Run declared checks / record evidence',
                        integrate:
                          'Approve and integrate through the scoped Git panel',
                      }[key]
                    }
                  </label>
                ),
              )}
              {run && (
                <button
                  onClick={() =>
                    void perform(() =>
                      control({ type: 'permissions', permissions }),
                    )
                  }
                >
                  Apply permissions & pause dispatch
                </button>
              )}
              <h3>Plan proposal</h3>
              <p>
                Review every assignment, dependency, checkout, check
                executable/argument vector and repository allowlist before
                adoption. Never put credentials in the plan. Declared commands
                are intentional configuration, not saved terminal history.
              </p>
              {run?.proposal && (
                <button
                  onClick={() =>
                    setEditor(JSON.stringify(run.proposal, null, 2))
                  }
                >
                  Load coordinator proposal for editing
                </button>
              )}
              {run?.plan && (
                <button
                  onClick={() => setEditor(JSON.stringify(run.plan, null, 2))}
                >
                  Load adopted plan
                </button>
              )}
              <details>
                <summary>Add a job to the editable plan</summary>
                <label>
                  Title
                  <input
                    value={title}
                    maxLength={120}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label>
                  Brief
                  <textarea
                    value={brief}
                    maxLength={4096}
                    onChange={(e) => setBrief(e.target.value)}
                  />
                </label>
                <label>
                  Acceptance criteria
                  <textarea
                    value={criteria}
                    maxLength={2048}
                    onChange={(e) => setCriteria(e.target.value)}
                  />
                </label>
                <label>
                  Builder
                  <select
                    value={agent}
                    onChange={(e) => setAgent(e.target.value)}
                  >
                    <option value="">Choose existing agent</option>
                    {data?.agents.map((a) => (
                      <option key={a.node.id} value={a.node.id}>
                        {a.node.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Checkout
                  <select
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                  >
                    <option value="">
                      Shared directory — no isolation guarantee
                    </option>
                    {areas?.areas
                      .filter((a) => !a.removed)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Independent reviewer (launch in the same checkout)
                  <select
                    value={reviewer}
                    onChange={(e) => setReviewer(e.target.value)}
                  >
                    <option value="">Manual review only</option>
                    {data?.agents
                      .filter((a) => a.node.id !== agent)
                      .map((a) => (
                        <option key={a.node.id} value={a.node.id}>
                          {a.node.title}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Dependency job IDs (comma-separated)
                  <input
                    value={deps.join(',')}
                    onChange={(e) =>
                      setDeps(
                        e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      )
                    }
                  />
                </label>
                <button
                  disabled={!title || !brief || !criteria || !agent}
                  onClick={() => {
                    try {
                      const p = plan();
                      p.jobs.push({
                        id: crypto.randomUUID(),
                        title,
                        brief,
                        criteria,
                        dependencies: deps,
                        agent,
                        area: area || null,
                        reviewer: reviewer || null,
                        reviewTask: reviewer ? crypto.randomUUID() : null,
                      });
                      setEditor(JSON.stringify(p, null, 2));
                      setTitle('');
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  Add draft job
                </button>
              </details>
              <label>
                Editable plan JSON
                <textarea
                  rows={15}
                  value={editor}
                  onChange={(e) => setEditor(e.target.value)}
                  spellCheck={false}
                />
              </label>
              <button
                disabled={!run || !editor.trim()}
                onClick={() =>
                  void perform(() =>
                    control({ type: 'adopt', plan: parsePlan(editor) }),
                  )
                }
              >
                Validate & adopt plan
              </button>
              {run && (
                <>
                  <h3>Run controls</h3>
                  <div className="task-actions">
                    <button
                      onClick={() =>
                        void perform(() =>
                          control({ type: 'start', automatic: false }),
                        )
                      }
                    >
                      Start / resume manually
                    </button>
                    <button
                      onClick={() =>
                        void perform(() =>
                          control({ type: 'start', automatic: true }),
                        )
                      }
                    >
                      Start / resume automatic dispatch
                    </button>
                    <button
                      onClick={() =>
                        void perform(() => control({ type: 'pause' }))
                      }
                    >
                      Pause dispatch
                    </button>
                    <button
                      onClick={() =>
                        void perform(() => control({ type: 'cancel' }))
                      }
                    >
                      Request cancellation
                    </button>
                    <button
                      onClick={() =>
                        void perform(() =>
                          control({ type: 'coordinator', node: null }),
                        )
                      }
                    >
                      Continue with human planning
                    </button>
                  </div>
                  <p>
                    Pause stops new dispatches. Cancellation requests
                    cooperative stop. Emergency stop revokes capabilities and
                    terminates run processes. Interrupted work requires
                    reconciliation before handoff or retry.
                  </p>
                  <h3>Work & attention</h3>
                  <label>
                    Revision reason
                    <input
                      value={reason}
                      maxLength={512}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <label>
                    Stopped replacement agent
                    <select
                      value={handoff}
                      onChange={(e) => setHandoff(e.target.value)}
                    >
                      <option value="">Choose replacement</option>
                      {data?.agents.map((a) => (
                        <option key={a.node.id} value={a.node.id}>
                          {a.node.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  {scoped.map((t) => (
                    <article key={t.id}>
                      <strong>
                        {t.title}: {t.state}
                      </strong>
                      <code>{t.id}</code>
                      {t.reason && <p role="status">{t.reason}</p>}
                      <p>
                        {t.attempts.length}/{run.limits.attempts} attempts ·{' '}
                        {t.reviewOf ? 'Independent review' : 'Builder / task'} ·{' '}
                        {t.assignedTo}
                      </p>
                      <div className="task-actions">
                        <button
                          disabled={t.state !== 'ready'}
                          onClick={() =>
                            void perform(() =>
                              control({ type: 'dispatch', id: t.id }),
                            )
                          }
                        >
                          Dispatch one
                        </button>
                        <button
                          disabled={Boolean(t.reviewOf) || !reason.trim()}
                          onClick={() =>
                            void perform(() =>
                              control({ type: 'revise', id: t.id, reason }),
                            )
                          }
                        >
                          Stage bounded revision
                        </button>
                        <button
                          disabled={!handoff}
                          onClick={() =>
                            void perform(() =>
                              control({
                                type: 'handoff',
                                id: t.id,
                                agent: handoff,
                              }),
                            )
                          }
                        >
                          Hand off after stop & reconciliation
                        </button>
                      </div>
                    </article>
                  ))}
                  <h3>Declared checks</h3>
                  <p>
                    Stop all terminals first. Exact adopted .exe argument
                    vectors run locally with a timeout; output is discarded.
                    Evidence is saved only if the commit and checkout remain
                    unchanged.
                  </p>
                  {run.plan?.checks.map((c) => (
                    <article key={c.id}>
                      <strong>{c.name}</strong>
                      <code>
                        {c.program} {JSON.stringify(c.args)}
                      </code>
                      <p>
                        {c.timeoutMs} ms · task {c.task}
                      </p>
                      <button
                        disabled={!run.permissions.checks}
                        onClick={() =>
                          void perform(() =>
                            teamOperations.invoke('team_check_run', {
                              workspaceId,
                              runId: run.id,
                              id: c.id,
                            }),
                          )
                        }
                      >
                        Run this declared check
                      </button>
                    </article>
                  ))}
                  <details open>
                    <summary>
                      Local decision timeline ({run.events.length}/256)
                    </summary>
                    {run.events
                      .slice()
                      .reverse()
                      .map((e, i) => (
                        <p key={`${e.at}-${i}`}>
                          <time>{new Date(e.at).toLocaleString()}</time> ·{' '}
                          {e.source} · <strong>{e.kind}</strong> {e.task ?? ''}{' '}
                          — {e.detail}
                        </p>
                      ))}
                  </details>
                </>
              )}
            </div>
          </div>
        </fieldset>
      </section>
    </div>
  );
}
