import { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import { useStore } from 'zustand';
import type { CanvasNode } from '../canvas/model';
import { useCanvas } from '../canvas/store';
import { isDesktop } from '../native';
import { browsers, browserState } from './runtime';
import { browserUrl } from './geometry';

export function BrowserNode({ node }: { node: CanvasNode }) {
  const [address, setAddress] = useState(node.url ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setAddress(node.url ?? ''), [node.url]);
  const state = useStore(browserState);
  const session = state.sessions.find((s) => s.id === node.id);
  const perform = (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    void action()
      .catch((e) => setError(String(e)))
      .finally(() => setBusy(false));
  };
  return (
    <div className="browser-node" onPointerDown={(e) => e.stopPropagation()}>
      <form
        className="browser-navigation"
        onSubmit={(e) => {
          e.preventDefault();
          perform(async () => {
            const url = browserUrl(address);
            await browsers.open(node.id, url);
            browserState.setState({ error: '' });
            const s = useCanvas.getState();
            s.checkpoint();
            s.patch({ [node.id]: { url } });
          });
        }}
      >
        <button
          type="button"
          aria-label="Back"
          title="Back"
          disabled={!session || busy}
          onClick={() => perform(() => browsers.action(node.id, 'back'))}
        >
          <Icon name="back" />
        </button>
        <button
          type="button"
          aria-label="Forward"
          title="Forward"
          disabled={!session || busy}
          onClick={() => perform(() => browsers.action(node.id, 'forward'))}
        >
          <Icon name="forward" />
        </button>
        <button
          type="button"
          aria-label="Reload page"
          title="Reload page"
          disabled={!session || busy}
          onClick={() => perform(() => browsers.action(node.id, 'reload'))}
        >
          <Icon name="refresh" />
        </button>
        <input
          aria-label="Browser address"
          placeholder="https://example.com"
          maxLength={4096}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button disabled={!isDesktop() || busy} type="submit">
          Open
        </button>
        {session && (
          <button
            type="button"
            disabled={busy}
            onClick={() => perform(() => browsers.close(node.id))}
          >
            Stop
          </button>
        )}
      </form>
      <div className="browser-location" title={session?.url ?? node.url}>
        {error ||
          state.error ||
          (session
            ? `${session.loading ? 'Loading… ' : ''}${session.url}`
            : 'Paused · Open to load this page')}
      </div>
      <div className="browser-host" data-browser-host={node.id}>
        {!session && (
          <div className="browser-placeholder">
            <strong>Browse alongside your agents</strong>
            <p>
              {isDesktop()
                ? 'Enter an HTTP or HTTPS address and select Open. Saved pages stay paused when reopening a workspace.'
                : 'Open the desktop app to use browser nodes.'}
            </p>
            <small>Up to 8 live pages · Popups and downloads are blocked</small>
          </div>
        )}
      </div>
    </div>
  );
}
