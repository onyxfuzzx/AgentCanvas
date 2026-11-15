import { useEffect, useRef, useState } from 'react';
import { invoke } from '../native';
import { useCanvas } from '../canvas/store';
import { stopSession } from '../terminal/registry';
import type { TaskSnapshot } from '../tasks/model';
import { PageHeading } from '../ui/WorkspacePages';
import { Icon } from '../ui/Icon';
import { DiffViewer } from '../ui/DiffViewer';
import { descriptions } from '../ui/design';
import { areaMutations } from './runtime';
import {
  checksReady,
  findingsForCommit,
  independentReviews,
  integrationCommit,
  samePreview,
} from './review';
import type { Area, AreaCatalog, Preview, Review } from './model';

export function ReviewPage({
  workspaceId,
  initialAreaId,
  runId,
  onScope,
  onAreas,
}: {
  workspaceId: string;
  initialAreaId?: string;
  runId?: string;
  onScope: (area: Area) => void;
  onAreas: () => void;
}) {
  const nodes = useCanvas((s) => s.nodes);
  const [catalog, setCatalog] = useState<AreaCatalog>();
  const [tasks, setTasks] = useState<TaskSnapshot>();
  const [selected, setSelected] = useState(initialAreaId ?? '');
  const [review, setReview] = useState<Review>();
  const [preview, setPreview] = useState<Preview>();
  const [integratedSource, setIntegratedSource] = useState('');
  const [target, setTarget] = useState('main');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [checkName, setCheckName] = useState('');
  const [checkState, setCheckState] = useState('notRun');
  const [checkDetail, setCheckDetail] = useState('');
  const [findings, setFindings] = useState('');
  const [relative, setRelative] = useState('');
  const [file, setFile] = useState<string>();
  const alive = useRef(true),
    operation = useRef(false),
    epoch = useRef(0);
  const area = catalog?.areas.find((a) => a.id === selected && !a.removed);
  const available = catalog?.areas.filter((a) => !a.removed) ?? [];
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    void Promise.all([
      invoke<AreaCatalog>('area_catalog', { workspaceId }),
      invoke<TaskSnapshot>('task_snapshot', { workspaceId }),
    ])
      .then(([next, nextTasks]) => {
        if (cancelled) return;
        setCatalog(next);
        setTasks(nextTasks);
        const id =
          next.areas.find((a) => a.id === initialAreaId && !a.removed)?.id ??
          next.areas.find((a) => !a.removed)?.id;
        setSelected(id ?? '');
        if (!id) setBusy(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e));
          setBusy(false);
        }
      });
    return () => {
      cancelled = true;
      alive.current = false;
      ++epoch.current;
    };
  }, [workspaceId, initialAreaId]);
  useEffect(() => {
    if (!area) return;
    const ticket = ++epoch.current;
    setBusy(true);
    setError('');
    setMessage('');
    setReview(undefined);
    setPreview(undefined);
    setIntegratedSource('');
    setFindings('');
    setCheckName('');
    setCheckState('notRun');
    setCheckDetail('');
    setRelative('');
    setFile(undefined);
    if (area.operation.state !== 'complete') {
      setBusy(false);
      return;
    }
    void invoke<Review>('area_review', { workspaceId, id: area.id })
      .then((next) => {
        if (alive.current && ticket === epoch.current) {
          setReview(next);
          setFindings(
            findingsForCommit(next).current ? findingsForCommit(next).text : '',
          );
        }
      })
      .catch((e) => {
        if (alive.current && ticket === epoch.current) setError(String(e));
      })
      .finally(() => {
        if (alive.current && ticket === epoch.current) setBusy(false);
      });
    return () => {
      if (ticket === epoch.current) ++epoch.current;
    };
  }, [selected, workspaceId, Boolean(area)]);

  async function perform(action: () => Promise<void>) {
    if (busy || operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (e) {
      if (alive.current) {
        setError(String(e));
        setPreview(undefined);
      }
    } finally {
      operation.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function refresh() {
    setPreview(undefined);
    setFile(undefined);
    const [next, nextTasks] = await Promise.all([
      invoke<AreaCatalog>('area_catalog', { workspaceId }),
      invoke<TaskSnapshot>('task_snapshot', { workspaceId }),
    ]);
    if (!alive.current) return;
    setCatalog(next);
    setTasks(nextTasks);
    const nextId =
      next.areas.find((a) => a.id === selected && !a.removed)?.id ??
      next.areas.find((a) => !a.removed)?.id ??
      '';
    if (nextId !== selected) {
      setSelected(nextId);
      setReview(undefined);
      return;
    }
    const nextReview = nextId
      ? await invoke<Review>('area_review', { workspaceId, id: nextId })
      : undefined;
    if (!alive.current) return;
    setReview(nextReview);
    if (nextReview?.head !== review?.head)
      setFindings(
        nextReview && findingsForCommit(nextReview).current
          ? findingsForCommit(nextReview).text
          : '',
      );
  }
  async function mutate(action: Record<string, unknown>, success: string) {
    setPreview(undefined);
    const changed = await areaMutations.run<AreaCatalog>({
      workspaceId,
      action,
      ...(runId ? { runId } : {}),
    });
    if (!alive.current) return;
    setCatalog(changed);
    if (
      action.type === 'integrate' &&
      !integrationCommit(changed, String(action.id))
    ) {
      const changedArea = changed.areas.find((a) => a.id === action.id);
      setReview(undefined);
      throw new Error(
        changedArea?.operation.detail ||
          'Integration needs reconciliation in Task areas. Inspect the operation before continuing.',
      );
    }
    if (
      action.type === 'integrate' &&
      action.preview &&
      typeof action.preview === 'object' &&
      'head' in action.preview &&
      typeof action.preview.head === 'string'
    )
      setIntegratedSource(action.preview.head);
    await refresh();
    if (alive.current) setMessage(success);
  }
  const dirty = Boolean(review?.status.trim());
  const checksPass = Boolean(review && checksReady(review));
  const matches = Boolean(
    review &&
    preview &&
    preview.head === review.head &&
    preview.target === target &&
    samePreview(review.approval, preview),
  );
  const approved = Boolean(
    review?.approval &&
    review.approval.head === review.head &&
    review.approval.target === target &&
    !dirty,
  );
  const integrated = Boolean(review && integratedSource === review.head);
  const status = error
    ? 'Refresh required'
    : integrated
      ? 'Integrated'
      : !review
        ? busy
          ? 'Loading changes'
          : 'Review unavailable'
        : dirty
          ? 'Uncommitted changes'
          : approved
            ? 'Approved at these commits'
            : area?.integrated
              ? 'Previous integration recorded'
              : 'Review required';
  const reviewers =
    review && area ? independentReviews(area.id, review, tasks) : [];
  const savedFindings = review ? findingsForCommit(review) : undefined;
  const ready = Boolean(
    area &&
    review &&
    !dirty &&
    area.operation.state === 'complete' &&
    !error &&
    !integrated,
  );
  async function previewMerge() {
    if (!area) return;
    setPreview(undefined);
    const next = await invoke<Preview>('area_preview', {
      workspaceId,
      id: area.id,
      target,
    });
    if (!alive.current) return;
    if (review && next.head !== review.head) {
      setReview(undefined);
      throw new Error(
        'The source commit changed. Refresh and inspect its changes before continuing.',
      );
    }
    setPreview(next);
    setMessage(
      'Merge preview is ready. Inspect the source and target commits before approval.',
    );
  }
  return (
    <div className="design-page">
      <div className="page-width review-workspace">
        <PageHeading title="Review changes" description={descriptions.review}>
          <button disabled={busy} onClick={() => void perform(refresh)}>
            <Icon name="refresh" />
            Refresh
          </button>
          <button
            disabled={busy || !area}
            onClick={() => area && onScope(area)}
          >
            Open canvas scope
          </button>
          {preview ? (
            <button
              className="primary"
              disabled={busy || !ready || !checksPass}
              onClick={() =>
                area &&
                void perform(() =>
                  mutate(
                    {
                      type: matches ? 'integrate' : 'approve',
                      id: area.id,
                      preview,
                    },
                    matches
                      ? 'Approved commits integrated.'
                      : 'Approval saved. Preview the merge again to enable integration.',
                  ),
                )
              }
            >
              {matches ? 'Integrate approved' : 'Approve commits'}
            </button>
          ) : (
            <button
              className="primary"
              disabled={busy || !ready || !target.trim()}
              onClick={() => void perform(previewMerge)}
            >
              {integrated ? 'Integrated' : 'Preview merge'}
            </button>
          )}
        </PageHeading>
        <nav className="review-area-tabs" aria-label="Review task areas">
          {available.map((a) => (
            <button
              key={a.id}
              aria-current={a.id === selected ? 'page' : undefined}
              className={a.id === selected ? 'on' : ''}
              disabled={busy}
              onClick={() => setSelected(a.id)}
            >
              <Icon name="link" />
              {a.name}
            </button>
          ))}
        </nav>
        {error && (
          <div className="review-alert" role="alert">
            <strong>Review needs attention</strong>
            <p>{error}</p>
            <button disabled={busy} onClick={() => void perform(refresh)}>
              Refresh changes
            </button>
          </div>
        )}
        {message && (
          <p className="review-feedback" role="status">
            {message}
          </p>
        )}
        {!available.length && !busy && (
          <section className="design-card page-empty">
            <Icon name="layers" />
            <h2>No task areas to review.</h2>
            <p>Create a task area to inspect its committed changes.</p>
            <button onClick={onAreas}>Open task areas</button>
          </section>
        )}
        {busy && !review && (
          <section className="design-card" role="status">
            Reading local Git changes…
          </section>
        )}
        {area && (
          <>
            <section className="design-card review-commit-card">
              <div className="review-commit-heading">
                <Icon name="link" />
                <h2>{area.branch}</h2>
                {review && (
                  <code title={review.head}>{review.head.slice(0, 12)}</code>
                )}
                <span aria-hidden="true">→</span>
                <b>{target || 'Choose target'}</b>
                <span
                  className={`task-state ${dirty ? 'task-state-blocked' : approved ? 'task-state-done' : ''}`}
                >
                  {status}
                </span>
              </div>
              <p>
                {dirty
                  ? 'Commit the work first. Checks and approval apply to a clean, exact commit.'
                  : approved
                    ? 'Approval is bound to the source, target, and merge tree shown below.'
                    : 'Inspect the changes and current check evidence before approving these commits.'}
              </p>
              <details>
                <summary>Commit and checkout details</summary>
                <dl className="review-metadata">
                  <dt>Source commit</dt>
                  <dd>{review?.head ?? 'Not loaded'}</dd>
                  <dt>Base commit</dt>
                  <dd>{area.base}</dd>
                  <dt>Directory</dt>
                  <dd>{area.directory}</dd>
                  <dt>Repository</dt>
                  <dd>{area.repository}</dd>
                  <dt>Operation</dt>
                  <dd>
                    {area.operation.kind} · {area.operation.state}
                  </dd>
                </dl>
                {area.operation.detail && <p>{area.operation.detail}</p>}
                {area.integrated && (
                  <p>
                    Last integration commit: <code>{area.integrated}</code>
                  </p>
                )}
              </details>
              {area.operation.state !== 'complete' && (
                <p className="review-alert">
                  This area needs reconciliation.{' '}
                  <button disabled={busy} onClick={onAreas}>
                    Open task areas
                  </button>
                </p>
              )}
            </section>
            {review && (
              <>
                {dirty && (
                  <section className="design-card review-dirty">
                    <h2>Uncommitted files</h2>
                    <p className="page-caption">
                      Working-tree changes are visible in the diff. Untracked
                      files are listed here and may not appear in the patch.
                    </p>
                    <pre>{review.status}</pre>
                  </section>
                )}
                <DiffViewer key={area.id} diff={review.diff} />
                <section className="design-card">
                  <header className="review-section-heading">
                    <h2>Declared checks</h2>
                    <span
                      className={`task-state ${checksPass ? 'task-state-done' : ''}`}
                    >
                      {
                        review.checks.filter(
                          (c) =>
                            c.state === 'passed' &&
                            c.head === review.head &&
                            !dirty,
                        ).length
                      }{' '}
                      / {review.checks.length} current passes
                    </span>
                  </header>
                  <p className="page-caption">
                    Recorded evidence for this commit. Recording a result here
                    does not run a check.
                  </p>
                  {!review.checks.length && (
                    <p className="review-empty">
                      No checks recorded. At least one current passing check is
                      required before approval.
                    </p>
                  )}
                  {review.checks.map((check) => {
                    const state =
                      check.head !== review.head || dirty
                        ? 'stale'
                        : check.state;
                    return (
                      <div className="review-check-row" key={check.name}>
                        <Icon
                          name={state === 'passed' ? 'review' : 'activity'}
                        />
                        <div>
                          <strong>{check.name}</strong>
                          <p>
                            {check.detail || 'No evidence reference recorded.'}
                          </p>
                          <code title={check.head}>
                            {check.head.slice(0, 12)}
                          </code>
                        </div>
                        <span
                          className={`task-state ${state === 'passed' ? 'task-state-done' : state === 'failed' ? 'task-state-failed' : ''}`}
                        >
                          {state === 'notRun' ? 'Not run' : state}
                        </span>
                      </div>
                    );
                  })}
                  <details className="review-editor">
                    <summary>Record check evidence</summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void perform(() =>
                          mutate(
                            {
                              type: 'check',
                              id: area.id,
                              head: review.head,
                              name: checkName,
                              state: checkState,
                              detail: checkDetail,
                            },
                            'Check evidence saved for this commit.',
                          ),
                        );
                      }}
                    >
                      <fieldset disabled={busy || dirty}>
                        <div className="review-form-grid">
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
                        </div>
                        <label>
                          Evidence / artifact reference
                          <textarea
                            maxLength={1000}
                            rows={3}
                            value={checkDetail}
                            onChange={(e) => setCheckDetail(e.target.value)}
                          />
                        </label>
                        <button>Record for this commit</button>
                      </fieldset>
                    </form>
                  </details>
                </section>
                <section className="design-card">
                  <h2>Independent review</h2>
                  {!reviewers.length && (
                    <p className="review-empty">
                      No independent team review is linked to this area. Manual
                      findings below are separate from an accepted reviewer
                      result.
                    </p>
                  )}
                  {reviewers.map((record) => (
                    <div className="review-check-row" key={record.reviewer.id}>
                      <Icon name="team" />
                      <div>
                        <strong>
                          {nodes.find(
                            (n) => n.id === record.reviewer.assignedTo,
                          )?.title ?? 'Reviewer'}
                        </strong>
                        <p>{record.reviewer.title}</p>
                        <small>
                          {record.current
                            ? `Review task: ${record.reviewer.state}`
                            : 'Commit or builder attempt changed; this review is stale.'}
                        </small>
                        {record.current &&
                          record.reviewer.attempts.at(-1)?.summary && (
                            <p>{record.reviewer.attempts.at(-1)?.summary}</p>
                          )}
                      </div>
                      <span
                        className={`task-state ${record.accepted ? 'task-state-done' : ''}`}
                      >
                        {record.accepted
                          ? 'Accepted'
                          : record.current
                            ? 'Awaiting acceptance'
                            : 'Stale'}
                      </span>
                    </div>
                  ))}
                  <div className="review-findings">
                    <header className="review-section-heading">
                      <h3>Recorded findings</h3>
                      {savedFindings?.text && (
                        <span className="task-state">
                          {savedFindings.current
                            ? 'Current commit'
                            : 'Earlier commit'}
                        </span>
                      )}
                    </header>
                    <p className="task-text">
                      {savedFindings?.text || 'No manual findings recorded.'}
                    </p>
                  </div>
                  <details className="review-editor">
                    <summary>Edit findings for this commit</summary>
                    <label>
                      Reviewer findings
                      <textarea
                        disabled={busy}
                        maxLength={4096}
                        rows={5}
                        value={findings}
                        onChange={(e) => setFindings(e.target.value)}
                      />
                    </label>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void perform(() =>
                          mutate(
                            {
                              type: 'findings',
                              id: area.id,
                              head: review.head,
                              text: findings,
                            },
                            'Findings saved for this commit.',
                          ),
                        )
                      }
                    >
                      Save findings
                    </button>
                  </details>
                </section>
                <section className="design-card review-integration">
                  <h2>Approval and integration</h2>
                  <p className="page-caption">
                    Preview the merge, approve its exact commits, then preview
                    again to enable integration. Source or target changes are
                    rechecked by the native Git service.
                  </p>
                  <label className="review-target">
                    Target branch
                    <input
                      disabled={busy}
                      value={target}
                      maxLength={200}
                      onChange={(e) => {
                        setTarget(e.target.value);
                        setPreview(undefined);
                        setMessage('');
                      }}
                    />
                  </label>
                  {preview && (
                    <dl className="review-metadata">
                      <dt>Source</dt>
                      <dd>{preview.head}</dd>
                      <dt>Target</dt>
                      <dd>
                        {preview.target} at {preview.targetHead}
                      </dd>
                      <dt>Merge tree</dt>
                      <dd>{preview.tree}</dd>
                    </dl>
                  )}
                  {!checksPass && (
                    <p className="review-requirement">
                      Approval needs a clean commit and current passes for every
                      declared check.
                    </p>
                  )}
                  <div className="page-actions">
                    <button
                      disabled={busy || !ready || !target.trim()}
                      onClick={() => void perform(previewMerge)}
                    >
                      Preview merge & detect conflicts
                    </button>
                    {preview && (
                      <>
                        <button
                          disabled={busy || !ready || !checksPass || matches}
                          onClick={() =>
                            void perform(() =>
                              mutate(
                                { type: 'approve', id: area.id, preview },
                                'Approval saved. Preview again to enable integration.',
                              ),
                            )
                          }
                        >
                          Approve these exact commits
                        </button>
                        <button
                          className="primary"
                          disabled={busy || !ready || !checksPass || !matches}
                          onClick={() =>
                            void perform(() =>
                              mutate(
                                { type: 'integrate', id: area.id, preview },
                                'Approved commits integrated.',
                              ),
                            )
                          }
                        >
                          Integrate approved commits
                        </button>
                      </>
                    )}
                  </div>
                </section>
                <section className="design-card review-advanced">
                  <details>
                    <summary>Commit trail and file inspection</summary>
                    <h3>Commits since base</h3>
                    <pre>{review.commits || 'No commits after base.'}</pre>
                    <h3>Git file status</h3>
                    <pre>{review.files || 'No changes from base.'}</pre>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void perform(async () => {
                          const content = await invoke<string>('area_file', {
                            workspaceId,
                            id: area.id,
                            relative,
                          });
                          if (alive.current) setFile(content);
                        });
                      }}
                    >
                      <label>
                        Read UTF-8 file from this checkout
                        <input
                          disabled={busy}
                          required
                          placeholder="src/example.ts"
                          value={relative}
                          onChange={(e) => setRelative(e.target.value)}
                        />
                      </label>
                      <button disabled={busy}>Read file</button>
                    </form>
                    {file !== undefined && <pre>{file || '(Empty file)'}</pre>}
                  </details>
                </section>
              </>
            )}
            <details className="review-operation-tools">
              <summary>Terminal and area controls</summary>
              <p>
                Stop all application terminals before recording evidence or
                integrating. Cleanup and uncertain-operation recovery remain in
                Task areas.
              </p>
              <div className="page-actions">
                <button
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await Promise.all(
                        nodes
                          .filter((n) => n.kind === 'terminal')
                          .map((n) => stopSession(n.id)),
                      );
                      setMessage('Application terminals stopped.');
                    })
                  }
                >
                  Stop all terminals
                </button>
                <button disabled={busy} onClick={onAreas}>
                  Open task areas
                </button>
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
