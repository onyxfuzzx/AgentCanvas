import { Checkpoints } from './checkpoints';
import { record } from './protocol';

export type BackendState = {
  phase: 'starting' | 'connected' | 'failed' | 'stopping' | 'restarting';
  generation: number;
  error: string;
  attempts: number;
  recoveryPath?: string;
};
export interface BackendHost {
  readonly pid?: number;
  request(command: string, args?: Record<string, unknown>): Promise<unknown>;
  stop(): Promise<void>;
}
type Ports = {
  create: (failed: (error: Error) => void) => BackendHost;
  preserve: (saves: unknown) => Promise<string>;
  capture: () => Promise<void>;
  reload: (generation: number) => void;
  changed: (state: BackendState) => void;
  trusted: () => boolean;
};
function same(a: unknown, b: unknown): boolean {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : record(v)
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, canonical(v[k])]),
          )
        : v;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
function layout(document: Record<string, unknown>) {
  return {
    nodes: document.nodes,
    edges: document.edges,
    viewport: document.viewport,
    settings: document.settings,
  };
}
export class Backend {
  readonly checkpoints = new Checkpoints();
  state: BackendState = {
    phase: 'starting',
    generation: 1,
    error: '',
    attempts: 0,
  };
  private host?: BackendHost;
  private documents = new Map<string, Record<string, unknown>>();
  private active?: string;
  private restarting?: Promise<void>;
  private shutdown?: Promise<void>;
  private closed = false;
  constructor(private ports: Ports) {}
  get pid() {
    return this.host?.pid;
  }
  checkpoint(command: unknown, args: unknown) {
    this.checkpoints.update(command, args);
    if (
      command === 'workspace_save' &&
      record(args) &&
      typeof args.id === 'string'
    )
      this.active = args.id;
  }
  private publish(patch: Partial<BackendState>) {
    this.state = { ...this.state, ...patch };
    this.ports.changed(this.state);
  }
  private alive() {
    if (this.closed || !this.ports.trusted())
      throw new Error('Backend stopped or workspace trust revoked.');
  }
  private create() {
    this.alive();
    const generation = this.state.generation;
    const host = this.ports.create((error) => {
      if (this.closed || generation !== this.state.generation) return;
      this.publish({ phase: 'failed', error: error.message });
      // EOF first stops the scheduler and descendants. A replacement still waits
      // for the process/job confirmation in stop(), even after a crash.
      void host.stop().catch((failure) => {
        if (!this.closed && generation === this.state.generation)
          this.publish({ error: `${error.message} ${String(failure)}` });
      });
    });
    this.host = host;
    return host;
  }
  async start() {
    try {
      const host = this.create();
      await host.request('workspace_list');
      this.alive();
      if (this.state.phase !== 'failed')
        this.publish({ phase: 'connected', error: '' });
    } catch (error) {
      if (!this.closed) this.publish({ phase: 'failed', error: String(error) });
      throw error;
    }
  }
  private remember(
    command: string,
    args: Record<string, unknown>,
    result: unknown,
  ) {
    if (
      record(result) &&
      record(result.document) &&
      typeof result.document.id === 'string'
    )
      this.documents.set(result.document.id, structuredClone(result.document));
    if (command === 'workspace_activate' && typeof args.id === 'string')
      this.active = args.id;
    if (command === 'note_read') this.checkpoints.baseline(args, result);
    if (command === 'workspace_save' || command === 'note_save')
      this.checkpoints.saved(command, args);
  }
  async request(command: string, args: Record<string, unknown> = {}) {
    this.alive();
    const generation = this.state.generation,
      host = this.host;
    if (this.state.phase !== 'connected' || !host)
      throw new Error('Backend unavailable. Use Restart Backend.');
    const result = await host.request(command, args);
    if (
      this.closed ||
      this.state.phase !== 'connected' ||
      generation !== this.state.generation ||
      host !== this.host
    )
      throw new Error('Reply belongs to an earlier backend session.');
    this.remember(command, args, result);
    return result;
  }
  restart(): Promise<void> {
    if (this.restarting) return this.restarting;
    try {
      this.alive();
      if (this.state.attempts >= 3)
        throw new Error(
          'Three backend restart attempts used. Close and reopen the canvas to try again. Preserved drafts remain available.',
        );
    } catch (error) {
      return Promise.reject(error);
    }
    this.publish({
      phase: 'restarting',
      error: '',
      attempts: this.state.attempts + 1,
    });
    this.restarting = this.replace()
      .catch(async (error) => {
        let detail = String(error);
        if (!this.closed) {
          try {
            await this.host?.stop();
          } catch (stopError) {
            detail += ` ${String(stopError)}`;
          }
          this.publish({ phase: 'failed', error: detail });
        }
        throw error;
      })
      .finally(() => {
        this.restarting = undefined;
      });
    return this.restarting;
  }
  private async replace() {
    await this.ports.capture();
    this.alive();
    const recoveryPath = await this.ports.preserve(this.checkpoints.snapshot());
    this.publish({ recoveryPath });
    this.alive();
    await this.host?.stop();
    this.alive();
    this.publish({ generation: this.state.generation + 1 });
    const host = this.create();
    await host.request('workspace_list');
    this.alive();
    const saves = this.checkpoints.snapshot();
    const ids = new Set(
      saves.map((s) =>
        String(s.command === 'workspace_save' ? s.args.id : s.args.workspaceId),
      ),
    );
    if (this.active) ids.add(this.active);
    const opened = new Map<string, Record<string, unknown>>();
    for (const id of ids) {
      this.alive();
      const value = await host.request('workspace_open', { id });
      if (!record(value) || !record(value.document))
        throw new Error('Invalid restored workspace.');
      opened.set(id, value.document);
    }
    // Notes precede layout. Lost successful replies are reconciled by content;
    // differing disk content retains the existing optimistic conflict checks.
    saves.sort(
      (a, b) =>
        Number(a.command === 'workspace_save') -
        Number(b.command === 'workspace_save'),
    );
    for (const save of saves) {
      this.alive();
      const args = save.args;
      if (save.command === 'note_save') {
        const disk = await host.request('note_read', {
          workspaceId: args.workspaceId,
          relativePath: args.relativePath,
        });
        if (disk !== args.content) await host.request('note_save', args);
        this.checkpoints.saved(save.command, args);
      } else {
        const disk = opened.get(String(args.id))!;
        const known = this.documents.get(String(args.id));
        if (!same(layout(disk), args.layout)) {
          if (
            !known ||
            disk.revision !== known.revision ||
            !same(layout(disk), layout(known))
          )
            throw new Error(
              `Workspace changed on disk. Drafts remain at ${recoveryPath}. Use Recover Canvas Drafts to restore a copy.`,
            );
          const result = await host.request('workspace_save', args);
          this.remember(save.command, args, result);
        } else this.checkpoints.saved(save.command, args);
      }
    }
    if (this.active)
      await host.request('workspace_activate', { id: this.active });
    this.alive();
    this.publish({ phase: 'connected', error: '' });
    this.ports.reload(this.state.generation);
  }
  stop(): Promise<void> {
    if (this.shutdown) return this.shutdown;
    this.closed = true;
    this.publish({ phase: 'stopping' });
    this.shutdown = (async () => {
      await this.restarting?.catch(() => {});
      try {
        if (this.checkpoints.snapshot().length)
          await this.ports.preserve(this.checkpoints.snapshot());
      } finally {
        await this.host?.stop();
      }
    })();
    return this.shutdown;
  }
  async flush() {
    await this.checkpoints.flush((command, args) =>
      this.request(command, args),
    );
  }
}
