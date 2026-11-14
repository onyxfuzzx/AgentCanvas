import { boardColumns, taskMove, type BoardColumn } from './board';
import { descriptions } from '../ui/design';
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
  embedded = false,
  initialSelected,
  workspaceId,
  onClose,
}: {
  embedded?: boolean;
  initialSelected?: string;
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
  const pointerDrag = useRef<
    | {
        id: string;
        revision: number;
        pointer: number;
        x: number;
        y: number;
        active: boolean;
      }
    | undefined
  >(undefined);
  const suppressClick = useRef(false);
  const [dragged, setDragged] = useState<{ id: string; revision: number }>();
  const [dropColumn, setDropColumn] = useState<BoardColumn>();
  const [moveStatus, setMoveStatus] = useState('');
  const [mode, setMode] = useState<'board' | 'list'>('board');
  const initialApplied = useRef('');
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
  useEffect(() => {
    if (!initialSelected || initialApplied.current === initialSelected) return;
    const task = tasks.find((t) => t.id === initialSelected);
    if (task) {
      choose(task);
      initialApplied.current = initialSelected;
    }
  }, [initialSelected, snapshot]);
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
        const updated = next.board.tasks.find(
          (t) => t.id === request.action.id,
        );
        if (updated) {
          choose(updated);
          setMoveStatus(
            `${updated.title}: ${updated.state}. Confirmed by the workspace.`,
          );
        }
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
  const unsavedDraft = current
    ? Boolean(dirty)
    : Boolean(
        title.trim() || brief.trim() || criteria.trim() || dependencies.length,
      );
  const canMove = !readOnly && !unsavedDraft;
  const move = (id: string, target: BoardColumn, revision: number) => {
    if (!canMove || !snapshot) {
      setMoveStatus('Save your draft before moving a task.');
      return;
    }
    if (revision !== snapshot.board.revision) {
      setMoveStatus(
        'The board changed. Pick up the task again to use its current state.',
      );
      return;
    }
    const task = tasks.find((t) => t.id === id);
    if (!task) {
      setMoveStatus('This task is no longer available.');
      return;
    }
    const plan = taskMove(task, target, tasks);
    if (!plan.allowed) {
      setMoveStatus(plan.reason);
      return;
    }
    choose(task);
    setMoveStatus(
      `${plan.label}: ${task.title}. Waiting for the workspace to confirm.`,
    );
    void send(
      plan.action.type === 'dispatch'
        ? { ...plan.action, attemptId: crypto.randomUUID() }
        : plan.action,
    );
  };
  const draggingTask = tasks.find((t) => t.id === dragged?.id);
  return (
    <div className={embedded ? 'design-page' : 'modal-backdrop'}>
      <section
        className="task-board"
        ref={dialog}
        role={embedded ? 'region' : 'dialog'}
        aria-modal={embedded ? undefined : true}
        aria-labelledby="tasks-title"
        tabIndex={-1}
      >
        <header className="page-heading">
          <div>
            <h2 id="tasks-title">Tasks</h2>
            <p>{descriptions.tasks}</p>
          </div>
          <div className="page-actions">
            <input
              className="task-search"
              aria-label="Search tasks"
              placeholder="Search tasks"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className={attention ? 'on' : ''}
              aria-pressed={attention}
              onClick={() => setAttention(!attention)}
            >
              Needs attention
            </button>
            <span className="segmented">
              <button
                className={mode === 'board' ? 'on' : ''}
                onClick={() => setMode('board')}
              >
                Board
              </button>
              <button
                className={mode === 'list' ? 'on' : ''}
                onClick={() => setMode('list')}
              >
                List
              </button>
            </span>
            <button
              className="primary"
              disabled={readOnly}
              onClick={() => choose()}
            >
              New task
            </button>
            {!embedded && (
              <button onClick={onClose} disabled={busy}>
                Close
              </button>
            )}
          </div>
        </header>
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
          <div className="task-overview">
            <div className="task-board-controls">
              <button disabled={readOnly} onClick={() => void refresh()}>
                Refresh
              </button>
              <span>{tasks.length} tasks</span>
            </div>
            <p className="board-move-status" role="status" aria-live="polite">
              {moveStatus ||
                (unsavedDraft
                  ? 'Save your draft to enable task moves.'
                  : 'Drag a task to dispatch it or accept a submitted result. Review starts with an agent result.')}
            </p>
            {current && (
              <label className="keyboard-task-move">
                Move selected task
                <select
                  aria-label="Move selected task"
                  disabled={!canMove}
                  value=""
                  onChange={(e) => {
                    if (e.target.value && snapshot)
                      move(
                        current.id,
                        e.target.value as BoardColumn,
                        snapshot.board.revision,
                      );
                  }}
                >
                  <option value="">Choose an action</option>
                  {boardColumns.map(([column]) => {
                    const plan = taskMove(current, column, tasks);
                    return plan.allowed ? (
                      <option key={column} value={column}>
                        {plan.label}
                      </option>
                    ) : null;
                  })}
                </select>
              </label>
            )}
            {mode === 'board' ? (
              <div className="kanban-scroll">
                <div className="kanban-columns">
                  {boardColumns.map(([state, label]) => {
                    const rows = visibleTasks(tasks, search, attention).filter(
                      (t) =>
                        state === 'ready'
                          ? [
                              'draft',
                              'ready',
                              'blocked',
                              'failed',
                              'cancelled',
                            ].includes(t.state)
                          : t.state === state,
                    );
                    return (
                      <section
                        className={`kanban-column ${dropColumn === state && draggingTask ? (taskMove(draggingTask, state, tasks).allowed ? 'drop-allowed' : 'drop-blocked') : ''}`}
                        key={state}
                        data-board-column={state}
                      >
                        <h3>
                          {label}
                          <span>{rows.length}</span>
                        </h3>
                        {rows.map((t) => (
                          <button
                            className={`task-tile ${t.id === selected ? 'on' : ''}`}
                            key={t.id}
                            disabled={readOnly}
                            data-draggable={
                              canMove &&
                              !['done', 'cancelled', 'running'].includes(
                                t.state,
                              )
                            }
                            onPointerDown={(e) => {
                              suppressClick.current = false;
                              if (
                                !canMove ||
                                !snapshot ||
                                e.button !== 0 ||
                                ['done', 'cancelled', 'running'].includes(
                                  t.state,
                                )
                              )
                                return;
                              pointerDrag.current = {
                                id: t.id,
                                revision: snapshot.board.revision,
                                pointer: e.pointerId,
                                x: e.clientX,
                                y: e.clientY,
                                active: false,
                              };
                              e.currentTarget.setPointerCapture(e.pointerId);
                            }}
                            onPointerMove={(e) => {
                              const drag = pointerDrag.current;
                              if (
                                !drag ||
                                drag.pointer !== e.pointerId ||
                                Math.hypot(
                                  e.clientX - drag.x,
                                  e.clientY - drag.y,
                                ) < 6
                              )
                                return;
                              drag.active = true;
                              suppressClick.current = true;
                              setDragged({
                                id: drag.id,
                                revision: drag.revision,
                              });
                              const target = document
                                .elementFromPoint(e.clientX, e.clientY)
                                ?.closest('[data-board-column]')
                                ?.getAttribute(
                                  'data-board-column',
                                ) as BoardColumn | null;
                              setDropColumn(target ?? undefined);
                              if (target) {
                                const plan = taskMove(t, target, tasks);
                                setMoveStatus(
                                  plan.allowed
                                    ? `Release to ${plan.label.toLowerCase()}.`
                                    : plan.reason,
                                );
                              }
                            }}
                            onPointerUp={(e) => {
                              const drag = pointerDrag.current;
                              pointerDrag.current = undefined;
                              if (
                                e.currentTarget.hasPointerCapture(e.pointerId)
                              )
                                e.currentTarget.releasePointerCapture(
                                  e.pointerId,
                                );
                              setDragged(undefined);
                              setDropColumn(undefined);
                              if (
                                !drag ||
                                drag.pointer !== e.pointerId ||
                                (!drag.active &&
                                  Math.hypot(
                                    e.clientX - drag.x,
                                    e.clientY - drag.y,
                                  ) < 6)
                              )
                                return;
                              suppressClick.current = true;
                              e.preventDefault();
                              const target = document
                                .elementFromPoint(e.clientX, e.clientY)
                                ?.closest('[data-board-column]')
                                ?.getAttribute(
                                  'data-board-column',
                                ) as BoardColumn | null;
                              if (target) move(drag.id, target, drag.revision);
                            }}
                            onPointerCancel={() => {
                              pointerDrag.current = undefined;
                              setDragged(undefined);
                              setDropColumn(undefined);
                            }}
                            onLostPointerCapture={() => {
                              pointerDrag.current = undefined;
                              setDragged(undefined);
                              setDropColumn(undefined);
                            }}
                            onClick={() => {
                              if (!suppressClick.current) choose(t);
                            }}
                          >
                            <strong>{t.title}</strong>
                            <small>
                              <span
                                className={`task-state task-state-${t.state}`}
                              >
                                {t.state}
                              </span>{' '}
                              {'\u00b7'}{' '}
                              {nodes.find((n) => n.id === t.assignedTo)
                                ?.title ?? 'Missing agent'}
                            </small>
                            {t.dependencies.length > 0 && (
                              <small>
                                {t.dependencies.length} dependencies
                              </small>
                            )}
                          </button>
                        ))}
                        <button
                          className="column-add"
                          disabled={readOnly}
                          onClick={() => choose()}
                        >
                          Add task
                        </button>
                      </section>
                    );
                  })}
                </div>
              </div>
            ) : (
              <nav className="task-list-view" aria-label="Task list">
                {visibleTasks(tasks, search, attention).map((t) => (
                  <button
                    key={t.id}
                    className={t.id === selected ? 'on' : ''}
                    disabled={readOnly}
                    onClick={() => choose(t)}
                  >
                    <strong>{t.title}</strong>
                    <span className={`task-state task-state-${t.state}`}>
                      {t.state}
                    </span>
                    <small>
                      {nodes.find((n) => n.id === t.assignedTo)?.title ??
                        'Missing agent'}
                    </small>
                  </button>
                ))}
              </nav>
            )}
            {!tasks.length && (
              <p className="page-caption">
                No tasks yet. Give the team one clear piece of work.
              </p>
            )}
          </div>
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
                    {a.assignedTo && (
                      <p>
                        Attempt agent: <code>{a.assignedTo}</code>
                      </p>
                    )}
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
