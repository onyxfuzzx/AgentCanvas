import { useSyncExternalStore } from 'react';
import { getSession } from './registry';
export function NodeStatus({ id }: { id: string }) {
  const session = getSession(id)?.session;
  const meta = useSyncExternalStore(
    session?.subscribe ?? (() => () => {}),
    session?.snapshot ?? (() => undefined),
  );
  const state = !meta
    ? 'Unavailable'
    : meta.status === 'running'
      ? meta.activity === 'waiting'
        ? 'Needs input'
        : meta.activity === 'idle'
          ? 'Idle'
          : 'Running'
      : meta.status[0].toUpperCase() + meta.status.slice(1);
  return (
    <span className="node-state" title={meta?.summary.text ?? state}>
      {state}
      <i
        className={`status-dot status-${state.toLowerCase().replace(' ', '-')}`}
      />
    </span>
  );
}
