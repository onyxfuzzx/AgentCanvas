import { useEffect, useRef, useState } from 'react';
import { invoke } from '../native';
import { useCanvas } from '../canvas/store';
import { useDialogFocus } from '../ui/useDialogFocus';
import { taskMutations } from './runtime';
import { stopSession } from '../terminal/registry';
import type { AreaCatalog } from '../areas/model';
import {
  visibleTasks,
  type Task,
  type TaskAction,
  type TaskSnapshot,
} from './model';

export function TaskBoard({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const nodes = useCanvas((s) => s.nodes);
  const terminals = nodes.filter((n) => n.kind === 'terminal');
  const [snapshot, setSnapshot] = useState<TaskSnapshot>();
  const [areas, setAreas] = useState<AreaCatalog>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const [attention, setAttention] = useState(false);
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [criteria, setCriteria] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dependencies, setDependencies] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<{
    requestId: string;
    revision: number;
    action: TaskAction;
  }>();
  const alive = useRef(true);
  const operation = useRef(false);
  const sequence = useRef(0);
  const dialog = useDialogFocus<HTMLElement>(() => {
    if (!busy) onClose();
  });
  const refresh = async () => {
    if (operation.current) return;
    const ticket = ++sequence.current;
    try {
      const next = await invoke<TaskSnapshot>('task_snapshot', { workspaceId });
      if (alive.current && ticket === sequence.current) {
        setSnapshot(next);
        setError('');
      }
    } catch (e) {
      if (alive.current && ticket === sequence.current) setError(String(e));
    }
  };
  useEffect(() => {
    alive.current = true;
    void refresh();
    void invoke<AreaCatalog>('area_catalog', { workspaceId })
      .then(setAreas)
      .catch((e) => setError(String(e)));
    return () => {
      alive.current = false;
    };
    // The parent keys this board to the active workspace.
  }, []);
  // Poll only after the previous request resolves, and preserve edit drafts.
  useEffect(() => {
    if (busy || pending) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await refresh();
      if (!stopped) timer = setTimeout(() => void tick(), 3000);
    };
    timer = setTimeout(() => void tick(), 3000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [busy, pending]);
  const tasks = snapshot?.board.tasks ?? [];
  const current = tasks.find((t) => t.id === selected);
  const choose = (task?: Task) => {
    setSelected(task?.id ?? '');
    setTitle(task?.title ?? '');
    setBrief(task?.brief ?? '');
    setCriteria(task?.criteria ?? '');
    setAssignedTo(task?.assignedTo ?? terminals[0]?.id ?? '');
    setDependencies(task?.dependencies ?? []);
    setReason('');
  };
  const send = async (action?: TaskAction) => {
    if (!snapshot || operation.current) return;
    const request = action
      ? {
          requestId: crypto.randomUUID(),
          revision: snapshot.board.revision,
          action,
        }
      : pending;
    if (!request) return;
    operation.current = true;
    ++sequence.current;
    setBusy(true);
    setPending(request);
    setError('');
    try {
      const next = await taskMutations.run<TaskSnapshot>({
        workspaceId,
        ...request,
      });
      if (alive.current) {
        setSnapshot(next);
        setPending(undefined);
        setSelected(request.action.id);
      }
    } catch (e) {
      if (alive.current)
        setError(
          `${String(e)} Retry uses the same request ID. Refresh before retrying a rejected action.`,
        );
    } finally {
      operation.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const save = () =>
    void send({
      type: current ? 'edit' : 'create',
      id: current?.id ?? crypto.randomUUID(),
      title,
      brief,
      criteria,
      assignedTo: assignedTo || terminals[0]?.id || '',
      dependencies,
    });
  const active = current?.attempts.at(-1);
  const stopAssigned = async () => {
    if (!current || operation.current) return;
    operation.current = true;
    ++sequence.current;
    setBusy(true);
    try {
      await stopSession(current.assignedTo);
      setPending(undefined);
      operation.current = false;
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      operation.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const dirty =
    current &&
    (title !== current.title ||
      brief !== current.brief ||
      criteria !== current.criteria ||
      (assignedTo || terminals[0]?.id) !== current.assignedTo ||
      JSON.stringify(dependencies) !== JSON.stringify(current.dependencies));
  const readOnly = busy || Boolean(pending);
  return (
    <div className="modal-backdrop">
      <section
        className="task-board"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tasks-title"
        tabIndex={-1}
      >
        <header>
          <h2 id="tasks-title">Tasks</h2>
          <button onClick={onClose} disabled={busy}>
            Close
          </button>
        </header>
        <p>
          Cooperative inbox delivery. Start an agent, brief it with the helper
          protocol, then dispatch. Acknowledgements and results come from the
          agent; completion requires your acceptance.
        </p>
        {snapshot?.recovered && (
          <p role="status">
            Recovered task backup. The corrupt original will be archived on the
            next save.
          </p>
        )}
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        {pending && (
          <div className="task-actions">
            <button disabled={busy} onClick={() => void send()}>
              Retry same request
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setPending(undefined);
                void refresh();
              }}
            >
              Refresh after error
            </button>
          </div>
        )}
        <div className="task-columns">
          <nav aria-label="Task list">
            <div className="task-actions">
              <button disabled={readOnly} onClick={() => choose()}>
                New task
              </button>
              <button disabled={readOnly} onClick={() => void refresh()}>
                Refresh
              </button>
            </div>
            <label>
              Search
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={attention}
                onChange={(e) => setAttention(e.target.checked)}
              />{' '}
              Needs attention
            </label>
            {visibleTasks(tasks, search, attention).map((t) => (
              <button
                className={t.id === selected ? 'chosen' : ''}
                key={t.id}
                disabled={readOnly}
                onClick={() => choose(t)}
              >
                <strong>{t.title}</strong>
                <small>
                  {t.state} ·{' '}
                  {nodes.find((n) => n.id === t.assignedTo)?.title ??
                    'Missing agent'}
                </small>
              </button>
            ))}
            {!tasks.length && <p>No tasks yet.</p>}
          </nav>
          <div className="task-detail">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <fieldset
                disabled={
                  readOnly || Boolean(current && current.state !== 'draft')
                }
              >
                <label>
                  Title
                  <input
                    required
                    maxLength={120}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label>
                  Task brief
                  <textarea
                    required
                    maxLength={4096}
                    rows={4}
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                  />
                </label>
                <label>
                  Acceptance criteria
                  <textarea
                    required
                    maxLength={2048}
                    rows={3}
                    value={criteria}
                    onChange={(e) => setCriteria(e.target.value)}
                  />
                </label>
                <label>
                  Assigned terminal or agent
                  <select
                    required
                    value={assignedTo || terminals[0]?.id || ''}
                    onChange={(e) => setAssignedTo(e.target.value)}
                  >
                    <option value="">Choose a terminal</option>
                    {terminals.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.title}
                        {n.agent ? '' : ' (cooperative shell)'}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Dependencies
                  <select
                    multiple
                    value={dependencies}
                    onChange={(e) =>
                      setDependencies(
                        Array.from(e.target.selectedOptions, (o) => o.value),
                      )
                    }
                  >
                    {tasks
                      .filter((t) => t.id !== selected)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                  </select>
                </label>
                <small>
                  Task text uses UTF-8 byte limits. Terminal output and shell
                  command history are never saved.
                </small>
                <button type="submit" disabled={!snapshot || !terminals.length}>
                  {current ? 'Save draft' : 'Create draft'}
                </button>
              </fieldset>
            </form>
            {current && (
              <>
                <p>
                  <strong>{current.state}</strong> · {current.source} ·{' '}
                  {new Date(current.updatedAt).toLocaleString()}
                </p>
                <code>{current.id}</code>
                <label>
                  Execution area
                  <select
                    disabled={readOnly || current.state !== 'draft'}
                    value={current.checkoutRef ?? ''}
                    onChange={(e) =>
                      void send({
                        type: 'checkout',
                        id: current.id,
                        areaId: e.target.value || null,
                      })
                    }
                  >
                    <option value="">
                      Shared directory — no managed isolation
                    </option>
                    {areas?.areas
                      .filter((a) => !a.removed)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} · {a.directory}
                        </option>
                      ))}
                  </select>
                </label>
                <p>
                  Checkout reference:{' '}
                  {current.checkoutRef || 'Shared directory'}. Managed tasks
                  dispatch only to a terminal launched in that checkout. Git
                  review and integration are in Task areas & Git.
                </p>
                {current.reason && <p role="status">{current.reason}</p>}
                <div className="task-actions">
                  {['running', 'blocked'].includes(current.state) && (
                    <button disabled={busy} onClick={() => void stopAssigned()}>
                      Stop assigned terminal
                    </button>
                  )}
                  {current.state === 'draft' && (
                    <button
                      disabled={readOnly || Boolean(dirty)}
                      title={dirty ? 'Save draft changes first' : undefined}
                      onClick={() =>
                        void send({ type: 'ready', id: current.id })
                      }
                    >
                      Mark ready
                    </button>
                  )}
                  {current.state === 'ready' && (
                    <button
                      disabled={readOnly}
                      onClick={() =>
                        void send({
                          type: 'dispatch',
                          id: current.id,
                          attemptId: crypto.randomUUID(),
                        })
                      }
                    >
                      Dispatch to inbox
                    </button>
                  )}
                  {current.state === 'review' && (
                    <button
                      disabled={readOnly}
                      onClick={() =>
                        void send({ type: 'accept', id: current.id })
                      }
                    >
                      Accept result
                    </button>
                  )}
                  {!['done', 'cancelled'].includes(current.state) && (
                    <button
                      disabled={readOnly}
                      onClick={() =>
                        void send({ type: 'cancel', id: current.id })
                      }
                    >
                      Cancel task
                    </button>
                  )}
                  {['blocked', 'failed'].includes(current.state) &&
                    (['draft', 'ready', 'failed', 'cancelled'] as const).map(
                      (outcome) => (
                        <button
                          key={outcome}
                          disabled={readOnly}
                          onClick={() =>
                            void send({
                              type: 'resolve',
                              id: current.id,
                              outcome,
                            })
                          }
                        >
                          Resolve as {outcome}
                        </button>
                      ),
                    )}
                </div>
                {current.state === 'review' && (
                  <label>
                    Revision reason
                    <input
                      value={reason}
                      maxLength={512}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <button
                      disabled={readOnly || !reason.trim()}
                      onClick={() =>
                        void send({ type: 'reject', id: current.id, reason })
                      }
                    >
                      Request revision
                    </button>
                  </label>
                )}
                {active && (
                  <p>
                    Latest attempt: {active.state}.{' '}
                    {[
                      'dispatched',
                      'acknowledged',
                      'running',
                      'cancelling',
                    ].includes(active.state) &&
                      `Lease: ${new Date(active.leaseUntil).toLocaleTimeString()}. Heartbeat before expiry.`}
                  </p>
                )}
                <h3>Attempts ({current.attempts.length}/8)</h3>
                {current.attempts.map((a) => (
                  <article key={a.id}>
                    <code>{a.id}</code>
                    {a.checkoutRef && (
                      <p>
                        Attempt checkout: <code>{a.checkoutRef}</code>
                      </p>
                    )}
                    <p>
                      {a.state} · {new Date(a.at).toLocaleString()}
                    </p>
                    <p className="task-text">{a.summary}</p>
                    {a.artifacts.map((p) => (
                      <code key={p}>{p} </code>
                    ))}
                  </article>
                ))}
                <button
                  onClick={() => {
                    useCanvas.getState().select([current.assignedTo]);
                    onClose();
                  }}
                >
                  Select assigned node
                </button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
