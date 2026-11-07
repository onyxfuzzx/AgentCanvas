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
          aria-label="Manual terminal activity"
          disabled={meta.status !== 'running'}
          value={meta.activity}
          onChange={(e) =>
            session.setActivity(e.target.value as SessionMeta['activity'])
          }
        >
          <option value="running">Running</option>
          <option value="idle">Idle</option>
          <option value="waiting">Waiting for input</option>
        </select>
      </label>
      <p>Set this label manually. Process state: {meta.status}.</p>
    </div>
  );
}
