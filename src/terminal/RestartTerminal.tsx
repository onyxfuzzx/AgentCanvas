import { useSyncExternalStore } from 'react';
import { getSession } from './registry';
import type { Session } from './session';
export function RestartTerminal({
  id,
  onRestart,
}: {
  id: string;
  onRestart: () => void;
}) {
  const entry = getSession(id);
  return entry ? (
    <RestartControl session={entry.session} onRestart={onRestart} />
  ) : (
    <button onClick={onRestart}>Restore terminal…</button>
  );
}
function RestartControl({
  session,
  onRestart,
}: {
  session: Session;
  onRestart: () => void;
}) {
  const meta = useSyncExternalStore(session.subscribe, session.snapshot);
  return meta.status === 'error' ||
    meta.status === 'exited' ||
    meta.status === 'paused' ? (
    <button className="restart-terminal" onClick={onRestart}>
      {meta.status === 'paused' ? 'Edit launch settings…' : 'Restart terminal…'}
    </button>
  ) : null;
}
