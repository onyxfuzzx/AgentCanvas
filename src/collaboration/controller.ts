import { createStore } from 'zustand/vanilla';
import type { Transport } from '../terminal/session';
import type { WorkspaceLayout } from '../workspace/model';
export type LinkLog = {
  workspaceId: string;
  id: number;
  edgeId: string;
  source: string;
  target: string;
  sourceTitle: string;
  targetTitle: string;
  text: string;
  enter: boolean;
  operation: string;
  status: string;
  at: number;
};
type Snapshot = { revision: number; logs: LinkLog[]; liveNodes: string[] };
export type Graph = { workspaceId: string; layout: WorkspaceLayout };
export function visiblePeerText(text: string) {
  return JSON.stringify(text).replace(
    /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}
export class Collaboration {
  readonly state = createStore(() => ({
    revision: 0,
    logs: [] as LinkLog[],
    liveNodes: [] as string[],
    error: '',
    syncing: false,
  }));
  private sent = '';
  private running: Promise<void> | undefined;
  private polling = false;
  private syncError = '';
  constructor(
    private invoke: Transport,
    private graph: () => Graph | null,
  ) {}
  private signature(graph: Graph) {
    return JSON.stringify([
      graph.workspaceId,
      graph.layout.nodes.map((n) => [n.id, n.kind, n.title, n.relativePath]),
      graph.layout.edges,
    ]);
  }
  sync(): Promise<void> {
    if (this.running) return this.running.then(() => this.sync());
    const current = this.graph();
    if (!current || this.sent === this.signature(current)) {
      if (this.syncError) {
        this.syncError = '';
        this.state.setState({ error: '' });
      }
      return Promise.resolve();
    }
    this.state.setState({ syncing: true });
    this.running = (async () => {
      let next: Graph | null = current;
      while (next && this.signature(next) !== this.sent) {
        const signature = this.signature(next);
        await this.invoke('collaboration_sync', next);
        this.sent = signature;
        next = this.graph();
      }
      this.syncError = '';
      this.state.setState({ error: '' });
    })()
      .catch((error) => {
        this.syncError = String(error);
        this.state.setState({ error: this.syncError });
        throw error;
      })
      .finally(() => {
        this.running = undefined;
        this.state.setState({ syncing: false });
      });
    return this.running;
  }
  async refresh() {
    const update = await this.invoke<Snapshot | null>(
      'collaboration_snapshot',
      { after: this.state.getState().revision },
    );
    if (update) this.state.setState(update);
    if (!this.syncError && this.state.getState().error)
      this.state.setState({ error: '' });
  }
  start() {
    if (this.polling) return;
    this.polling = true;
    const tick = async () => {
      try {
        await this.refresh();
      } catch (error) {
        this.state.setState({ error: String(error) });
      }
      setTimeout(() => void tick(), 500);
    };
    void tick();
  }
  async decide(id: number, allow: boolean) {
    await this.sync();
    await this.invoke('collaboration_decide', { id, allow });
    await this.refresh();
  }
}
