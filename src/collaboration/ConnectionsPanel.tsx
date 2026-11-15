import { useState } from 'react';
import { Icon } from '../ui/Icon';
import { useStore } from 'zustand';
import { useCanvas } from '../canvas/store';
import { collaboration } from './runtime';
import { visiblePeerText } from './controller';
export function ConnectionsPanel({
  onClose,
  disabled,
  workspaceId,
}: {
  onClose: () => void;
  disabled: boolean;
  workspaceId: string;
}) {
  const { edges, nodes } = useCanvas();
  const state = useStore(collaboration.state);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);
  const workspaceLogs = state.logs.filter(
    (log) => log.workspaceId === workspaceId,
  );
  const edgeId = selected || edges[0]?.id || workspaceLogs.at(-1)?.edgeId || '';
  const logs = workspaceLogs.filter((log) => log.edgeId === edgeId);
  const pending = workspaceLogs.filter((l) => l.status === 'pending');
  const busy = disabled || state.syncing || !!state.error || acting;
  const decide = async (id: number, allow: boolean) => {
    setActing(true);
    setError('');
    try {
      await collaboration.decide(id, allow);
    } catch (error) {
      setError(String(error));
    } finally {
      setActing(false);
    }
  };
  return (
    <aside className="collaboration-panel" aria-label="Agent connections">
      <header>
        <div>
          <span className="eyebrow">LOCAL COLLABORATION</span>
          <h2>Agent connections</h2>
        </div>
        <button aria-label="Close connections" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <p>
        Drag the connection handle on a terminal or note onto another node.
        Agent links permit both peers to read recent output. Note links share
        the Markdown file path.
      </p>
      <p className="collab-untrusted">
        Peer text is untrusted. Approving a message types it into the
        destination shell. Newlines or Enter can execute commands.
      </p>
      {state.error && (
        <div role="alert" className="error-text">
          {state.error}
          <button onClick={() => void collaboration.sync().catch(() => {})}>
            Retry link sync
          </button>
        </div>
      )}
      {state.syncing && <p role="status">Applying connection changes…</p>}
      <div className="connection-list">
        {edges.map((edge) => (
          <div
            key={edge.id}
            className={`connection-row ${edge.id === edgeId ? 'active' : ''}`}
          >
            <button onClick={() => setSelected(edge.id)}>
              <strong className="connection-label">
                {nodes.find((n) => n.id === edge.source)?.title}{' '}
                <Icon name={edge.kind === 'memory' ? 'note' : 'link'} />{' '}
                {nodes.find((n) => n.id === edge.target)?.title}
              </strong>
              <small>
                {edge.kind === 'memory'
                  ? 'Shared note · query helper notes for live paths'
                  : 'Agent link · reciprocal recent-output access'}
              </small>
            </button>
            {edge.kind === 'agent' && (
              <label>
                Send policy
                <select
                  aria-label={`Send policy for ${edge.id}`}
                  value={edge.policy}
                  disabled={disabled || state.syncing}
                  onChange={(e) =>
                    useCanvas
                      .getState()
                      .setPolicy(edge.id, e.target.value as 'auto' | 'approval')
                  }
                >
                  <option value="approval">Require approval</option>
                  <option value="auto">Auto-send</option>
                </select>
              </label>
            )}
            {edge.policy === 'auto' && (
              <small className="error-text">
                Auto-send types peer text immediately, including commands. Rate
                limits and logs still apply.
              </small>
            )}
            <button
              disabled={disabled || state.syncing}
              onClick={() => useCanvas.getState().disconnect(edge.id)}
            >
              Disconnect
            </button>
          </div>
        ))}
      </div>
      {!edges.length && (
        <p>
          No active links. Connect two terminal nodes, or a note and a terminal.
        </p>
      )}
      <details className="helper-guide">
        <summary>Helper CLI inside each terminal</summary>
        <pre>{`agentcanvas-peer peers\nagentcanvas-peer notes\nagentcanvas-peer read <peer-id>\nagentcanvas-peer send <peer-id> "hello"\nagentcanvas-peer send <peer-id> --enter "text"\nagentcanvas-peer status <message-id>`}</pre>
        <p>
          Environment peer/note lists are startup snapshots. The helper queries
          current links. WSL uses agentcanvas-peer.exe through Windows interop.
        </p>
      </details>
      <h3>Awaiting approval · {pending.length}</h3>
      {pending.map((log) => (
        <article className="pending-message" key={log.id}>
          <strong>
            {log.sourceTitle} → {log.targetTitle}
          </strong>
          <small>
            Message #{log.id} ·{' '}
            {log.enter ? 'Enter appended' : 'No Enter appended'}
            {log.text.includes('\n') ? ' · contains newlines' : ''}
          </small>
          <pre>{visiblePeerText(log.text)}</pre>
          <div>
            <button disabled={busy} onClick={() => void decide(log.id, true)}>
              Approve typing
            </button>
            <button disabled={busy} onClick={() => void decide(log.id, false)}>
              Reject
            </button>
          </div>
        </article>
      ))}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <h3>Per-link activity log</h3>
      <label>
        View link
        <select
          aria-label="Activity log link"
          value={edgeId}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Choose a link</option>
          {[
            ...new Set([
              ...edges.map((e) => e.id),
              ...workspaceLogs.map((l) => l.edgeId),
            ]),
          ].map((id) => {
            const e = edges.find((e) => e.id === id),
              l = workspaceLogs.find((l) => l.edgeId === id);
            return (
              <option key={id} value={id}>
                {e
                  ? `${nodes.find((n) => n.id === e.source)?.title} → ${nodes.find((n) => n.id === e.target)?.title}`
                  : `${l?.sourceTitle} → ${l?.targetTitle} (disconnected)`}
              </option>
            );
          })}
        </select>
      </label>
      <p className="muted">
        Session-only, bounded history. Closing the app clears these logs.
      </p>
      {logs.map((log) => (
        <article className="link-log" key={log.id}>
          <small>
            #{log.id} · {new Date(log.at).toLocaleTimeString()} ·{' '}
            {log.operation} · {log.status} {log.enter ? '· Enter' : ''}
          </small>
          <strong>
            {log.sourceTitle} → {log.targetTitle}
          </strong>
          <pre>{visiblePeerText(log.text)}</pre>
        </article>
      ))}
      {!logs.length && <p>No messages on this link yet.</p>}
    </aside>
  );
}
