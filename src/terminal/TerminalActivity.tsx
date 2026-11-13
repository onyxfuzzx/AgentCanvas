import { useSyncExternalStore } from 'react';
import { getSession } from './registry';
import type { Session, SessionMeta } from './session';

export function TerminalActivity({ id }: { id: string }) {
  const entry = getSession(id);
  return entry ? <ActivityControl session={entry.session} /> : null;
}
function ActivityControl({ session }: { session: Session }) {
  const meta = useSyncExternalStore(session.subscribe, session.snapshot);
  return (
    <div className="activity-control">
      <label>
        Activity
        <select
          aria-label="Terminal activity mode"
          disabled={meta.status !== 'running'}
          value={meta.manualActivity ? meta.activity : 'auto'}
          onChange={(e) =>
            e.target.value === 'auto'
              ? session.useAutomaticActivity()
              : session.setActivity(e.target.value as SessionMeta['activity'])
          }
        >
          <option value="auto">Automatic (heuristic)</option>
          <option value="running">Running</option>
          <option value="idle">Idle</option>
          <option value="waiting">Waiting for input</option>
        </select>
      </label>
      <p className="activity-summary">
        <strong>{meta.summary.text}</strong>
      </p>
      {meta.summary.detail && (
        <p className="activity-detail">{meta.summary.detail}</p>
      )}
      <p>
        Process: {meta.status}. Quiet output does not prove a task is idle.
        Input prompts are inferred; you can override the label.
      </p>
    </div>
  );
}
