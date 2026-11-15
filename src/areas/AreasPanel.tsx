import { Icon } from '../ui/Icon';
import { DiffViewer } from '../ui/DiffViewer';
import { descriptions } from '../ui/design';
import { useEffect, useRef, useState } from 'react';
import { invoke } from '../native';
import { useDialogFocus } from '../ui/useDialogFocus';
import { stopSession } from '../terminal/registry';
import { useCanvas } from '../canvas/store';
import { areaMutations } from './runtime';
import type { Area, AreaCatalog, Preview, Review } from './model';
import type { TaskSnapshot } from '../tasks/model';

export function AreasPanel({
  embedded = false,
  reviewMode = false,
  onReview,
  workspaceId,
  onClose,
  onLaunch,
  onScope,
  runId,
}: {
  embedded?: boolean;
  reviewMode?: boolean;
  onReview?: (id: string) => void;
  workspaceId: string;
  onClose: () => void;
  onLaunch: (area: Area) => void;
  onScope: (area: Area | null) => void;
  runId?: string;
}) {
  const [catalog, setCatalog] = useState<AreaCatalog>();
  const [tasks, setTasks] = useState<TaskSnapshot>();
  const [selected, setSelected] = useState('');
  const [repository, setRepository] = useState('');
  const [base, setBase] = useState('');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('main');
  const [review, setReview] = useState<Review>();
  const [preview, setPreview] = useState<Preview>();
  const [checkName, setCheckName] = useState('');
  const [checkState, setCheckState] = useState('notRun');
  const [detail, setDetail] = useState('');
  const [findings, setFindings] = useState('');
  const [relative, setRelative] = useState('');
  const [file, setFile] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const alive = useRef(true);
  const dialog = useDialogFocus<HTMLElement>(() => {
    if (!running.current) onClose();
  });
  const current = catalog?.areas.find((a) => a.id === selected);
  useEffect(() => {
    alive.current = true;
    void invoke<TaskSnapshot>('task_snapshot', { workspaceId })
      .then((t) => {
        if (alive.current) setTasks(t);
      })
      .catch((e) => {
        if (alive.current) setError(String(e));
      });
    void invoke<AreaCatalog>('area_catalog', { workspaceId })
      .then((c) => {
        if (alive.current) setCatalog(c);
      })
      .catch((e) => {
        if (alive.current) setError(String(e));
      });
    return () => {
      alive.current = false;
    };
  }, [workspaceId]);
  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      if (alive.current) setError(String(e));
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function mutate(action: Record<string, unknown>) {
    const next = await areaMutations.run<AreaCatalog>({
      workspaceId,
      action,
      ...(runId ? { runId } : {}),
    });
    if (alive.current) {
      setCatalog(next);
      setPreview(undefined);
      setReview(undefined);
    }
  }
  function choose(a: Area) {
    setSelected(a.id);
    setReview(undefined);
    setPreview(undefined);
    setFile('');
    setFindings('');
  }
  useEffect(() => {
    if (reviewMode && !selected && catalog?.areas.some((a) => !a.removed))
      setSelected(catalog.areas.find((a) => !a.removed)!.id);
  }, [reviewMode, selected, catalog]);
  useEffect(() => {
    if (
      !reviewMode ||
      !current ||
      current.removed ||
      current.operation.state !== 'complete'
    )
      return;
    let cancelled = false;
    void invoke<Review>('area_review', { workspaceId, id: current.id })
      .then((r) => {
        if (!cancelled) setReview(r);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [reviewMode, current?.id, workspaceId]);
  return (
    <div className={embedded ? 'design-page' : 'modal-backdrop'}>
      <section
        className={`task-board area-panel ${reviewMode ? 'review-page' : 'areas-page'}`}
        role={embedded ? 'region' : 'dialog'}
        aria-modal={embedded ? undefined : true}
        aria-labelledby="areas-title"
        tabIndex={-1}
        ref={dialog}
      >
        <header className="page-heading">
          <div>
            <h2 id="areas-title">
              {reviewMode ? 'Review changes' : 'Task areas'}
            </h2>
            <p>{reviewMode ? descriptions.review : descriptions.areas}</p>
          </div>
          {!embedded && (
            <button disabled={busy} onClick={onClose}>
              Close
            </button>
          )}
        </header>
        <p>
          Each managed area has its own Git worktree, branch and canvas scope.
          Stop all app terminals before changing areas or recording evidence. A
          worktree isolates files; it is not an OS sandbox.
        </p>
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await Promise.all(
                useCanvas
                  .getState()
                  .nodes.filter((n) => n.kind === 'terminal')
                  .map((n) => stopSession(n.id)),
              );
            })
          }
        >
          Stop all terminals
        </button>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <fieldset disabled={busy}>
          {!reviewMode && (
            <div className="area-card-grid">
              {catalog?.areas
                .filter((a) => !a.removed)
                .map((a) => (
                  <section
                    className={`design-card area-summary ${selected === a.id ? 'on' : ''}`}
                    key={a.id}
                  >
                    <div className="area-summary-top">
                      <Icon name="branch" />
                      <span className="task-state">
                        {a.integrated
                          ? 'Integration recorded'
                          : a.operation.state}
                      </span>
                    </div>
                    <h2>{a.name}</h2>
                    <p className="area-branch">{a.branch}</p>
                    <p className="area-directory">{a.directory}</p>
                    <div className="page-actions">
                      <button onClick={() => choose(a)}>Details</button>
                      <button
                        onClick={() => {
                          choose(a);
                          onReview?.(a.id);
                        }}
                      >
                        Review
                      </button>
                      <button
                        onClick={() => {
                          onScope(a);
                          onClose();
                        }}
                      >
                        Canvas
                      </button>
                    </div>
                  </section>
                ))}
            </div>
          )}
          <div className="task-columns">
            <nav aria-label="Task areas">
              <button
                onClick={() => {
                  onScope(null);
                  onClose();
                }}
              >
                Show whole canvas
              </button>
              <button
                onClick={() =>
                  void run(async () => {
                    setCatalog(
                      await invoke<AreaCatalog>('area_catalog', {
                        workspaceId,
                      }),
                    );
                  })
                }
              >
                Refresh catalog
              </button>
              {catalog?.areas.map((a) => (
                <button
                  key={a.id}
                  className={selected === a.id ? 'chosen' : ''}
                  onClick={() => choose(a)}
                >
                  <strong>{a.name}</strong>
                  <small>
                    {a.removed ? 'Removed' : a.operation.state} · {a.branch}
                  </small>
                </button>
              ))}
              <details className="area-create">
                <summary>Create task area</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const id = crypto.randomUUID();
                    void run(async () => {
                      await mutate({
                        type: 'create',
                        id,
                        name,
                        repository,
                        base,
                      });
                      setSelected(id);
                    });
                  }}
                >
                  <label>
                    Name
                    <input
                      required
                      maxLength={120}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    Repository root (absolute)
                    <input
                      required
                      value={repository}
                      onChange={(e) => setRepository(e.target.value)}
                    />
                  </label>
                  <label>
                    Full base commit ID
                    <input
                      required
                      pattern="[a-fA-F0-9]{40}|[a-fA-F0-9]{64}"
                      value={base}
                      onChange={(e) => setBase(e.target.value)}
                    />
                  </label>
                  <p>
                    The branch will be agentcanvas/&lt;area UUID&gt;. The
                    directory will be task-areas/&lt;area UUID&gt; inside this
                    workspace. Only the selected commit is checked out; dirty
                    source files are excluded.
                  </p>
                  <p>
                    Bootstrap allowlist: empty. No ignored files, dependencies,
                    local settings or scripts are copied or run.
                  </p>
                  <button type="submit">Create worktree</button>
                </form>
              </details>
            </nav>
            <div className="task-detail">
              {current ? (
                <>
                  <h3>{current.name}</h3>
                  {tasks?.board.tasks
                    .filter(
                      (t) =>
                        t.checkoutRef === current.id ||
                        t.attempts.some((a) => a.checkoutRef === current.id),
                    )
                    .map((t) => (
                      <p key={t.id}>
                        Task: {t.title} · {t.state} · <code>{t.id}</code>.
                        Attempts in this area:{' '}
                        {t.attempts
                          .filter((a) => a.checkoutRef === current.id)
                          .map((a) => a.id)
                          .join(', ') || 'none yet'}
                        .
                      </p>
                    ))}
                  <dl>
                    <dt>Repository</dt>
                    <dd>{current.repository}</dd>
                    <dt>Base</dt>
                    <dd>
                      <code>{current.base}</code>
                    </dd>
                    <dt>Branch</dt>
                    <dd>{current.branch}</dd>
                    <dt>Absolute directory</dt>
                    <dd>{current.directory}</dd>
                  </dl>
                  <p role="status">
                    {current.operation.kind} · {current.operation.state}:{' '}
                    {current.operation.detail || 'Complete'}
                  </p>
                  {current.integrated && (
                    <p>
                      Integrated commit: <code>{current.integrated}</code>
                    </p>
                  )}
                  {!current.removed && (
                    <>
                      <div className="task-actions">
                        <button
                          onClick={() => {
                            onScope(current);
                            onClose();
                          }}
                        >
                          Open canvas scope
                        </button>
                        <button
                          disabled={current.operation.state !== 'complete'}
                          onClick={() => onLaunch(current)}
                        >
                          Launch agent here…
                        </button>
                        <button
                          onClick={() =>
                            void run(async () => {
                              setReview(
                                await invoke<Review>('area_review', {
                                  workspaceId,
                                  id: current.id,
                                }),
                              );
                              setPreview(undefined);
                            })
                          }
                        >
                          Read changes & evidence
                        </button>
                        {current.operation.state !== 'complete' && (
                          <button
                            onClick={() =>
                              void run(() =>
                                mutate({ type: 'reconcile', id: current.id }),
                              )
                            }
                          >
                            Reconcile observed state
                          </button>
                        )}
                      </div>
                      <p>
                        Uncertain operations never replay. Inspect this checkout
                        and target history before reconciling. A failed merge
                        may require manual resolution or abort in the target
                        repository.
                      </p>
                      {review && (
                        <>
                          <h3>
                            Review commit <code>{review.head}</code>
                          </h3>
                          <h4>Changed / untracked files</h4>
                          <pre>{review.status || 'Working tree clean'}</pre>
                          <pre>{review.files || 'No changes from base'}</pre>
                          <details>
                            <summary>Task-to-commit trail</summary>
                            <pre>
                              {review.commits || 'No commits after base'}
                            </pre>
                          </details>
                          <DiffViewer diff={review.diff} />
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              void run(async () =>
                                setFile(
                                  await invoke<string>('area_file', {
                                    workspaceId,
                                    id: current.id,
                                    relative,
                                  }),
                                ),
                              );
                            }}
                          >
                            <label>
                              Read UTF-8 file (relative path, up to 256 KiB)
                              <input
                                required
                                value={relative}
                                onChange={(e) => setRelative(e.target.value)}
                              />
                            </label>
                            <button>Read file</button>
                          </form>
                          {file && <pre>{file}</pre>}
                          <h4>Declared checks</h4>
                          <p>
                            These are explicit user records, not automatically
                            executed tests. Every declared check must pass at
                            the current clean commit before approval.
                          </p>
                          {review.checks.map((c) => (
                            <p key={c.name}>
                              <strong>
                                {c.name}: {c.state}
                              </strong>{' '}
                              · <code>{c.head}</code> · {c.detail}
                            </p>
                          ))}
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              void run(() =>
                                mutate({
                                  type: 'check',
                                  id: current.id,
                                  head: review.head,
                                  name: checkName,
                                  state: checkState,
                                  detail,
                                }),
                              );
                            }}
                          >
                            <label>
                              Check name
                              <input
                                required
                                maxLength={120}
                                value={checkName}
                                onChange={(e) => setCheckName(e.target.value)}
                              />
                            </label>
                            <label>
                              Result
                              <select
                                value={checkState}
                                onChange={(e) => setCheckState(e.target.value)}
                              >
                                <option value="notRun">Not run</option>
                                <option value="passed">Passed</option>
                                <option value="failed">Failed</option>
                              </select>
                            </label>
                            <label>
                              Evidence / artifact reference
                              <textarea
                                maxLength={1000}
                                value={detail}
                                onChange={(e) => setDetail(e.target.value)}
                              />
                            </label>
                            <button>Record check for this commit</button>
                          </form>
                          <p className="task-text">{review.findings}</p>
                          <label>
                            Reviewer findings
                            <textarea
                              maxLength={4096}
                              value={findings}
                              onChange={(e) => setFindings(e.target.value)}
                            />
                          </label>
                          <button
                            onClick={() =>
                              void run(() =>
                                mutate({
                                  type: 'findings',
                                  id: current.id,
                                  head: review.head,
                                  text: findings,
                                }),
                              )
                            }
                          >
                            Save findings for this commit
                          </button>
                        </>
                      )}
                      <h3>Integration</h3>
                      <label>
                        Target branch (currently checked out in repository
                        above)
                        <input
                          value={target}
                          maxLength={200}
                          onChange={(e) => {
                            setTarget(e.target.value);
                            setPreview(undefined);
                          }}
                        />
                      </label>
                      <button
                        onClick={() =>
                          void run(async () => {
                            setPreview(
                              await invoke<Preview>('area_preview', {
                                workspaceId,
                                id: current.id,
                                target,
                              }),
                            );
                          })
                        }
                      >
                        Preview merge & detect conflicts
                      </button>
                      {preview && (
                        <>
                          <p>
                            Source <code>{preview.head}</code> →{' '}
                            {preview.target} at{' '}
                            <code>{preview.targetHead}</code>. Merge tree{' '}
                            <code>{preview.tree}</code>.
                          </p>
                          <button
                            onClick={() =>
                              void run(() =>
                                mutate({
                                  type: 'approve',
                                  id: current.id,
                                  preview,
                                }),
                              )
                            }
                          >
                            Approve these exact commits
                          </button>
                          <button
                            disabled={
                              JSON.stringify(current.approval) !==
                              JSON.stringify(preview)
                            }
                            onClick={() =>
                              void run(() =>
                                mutate({
                                  type: 'integrate',
                                  id: current.id,
                                  preview,
                                }),
                              )
                            }
                          >
                            Integrate approved commits
                          </button>
                        </>
                      )}
                      <p>
                        Preview again after approval to enable integration. New
                        changes invalidate approval. Conflicted and rejected
                        work is retained.
                      </p>
                      <h3>Cleanup</h3>
                      <p>
                        Remove only this registered, integrated worktree after
                        stopping all terminals. Changed, untracked, ignored,
                        locked or unintegrated work is preserved. The branch
                        remains available.
                      </p>
                      <button
                        disabled={!current.integrated}
                        onClick={() =>
                          void run(() =>
                            mutate({ type: 'cleanup', id: current.id }),
                          )
                        }
                      >
                        Remove clean integrated worktree
                      </button>
                    </>
                  )}
                </>
              ) : (
                <p>
                  Select an area or create one. Terminals outside managed areas
                  use shared directories and have no Git isolation guarantee.
                </p>
              )}
            </div>
          </div>
        </fieldset>
      </section>
    </div>
  );
}
