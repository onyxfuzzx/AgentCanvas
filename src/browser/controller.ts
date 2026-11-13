import type { Transport } from '../terminal/session';

export type BrowserStatus = {
  id: string;
  url: string;
  title: string;
  loading: boolean;
};
export type Surface = {
  id: string;
  bounds: { x: number; y: number; width: number; height: number };
  clips: { x: number; y: number; width: number; height: number }[];
  zoom: number;
};

/** One ordered native queue: open/close/switch cannot overtake surface updates. */
export class BrowserController {
  private queue: Promise<unknown> = Promise.resolve();
  private pending: { surfaces: Surface[]; nodeIds: string[] } | null = null;
  private syncing = false;
  private last = '';
  constructor(private invoke: Transport) {}
  private run<T>(action: () => Promise<T>): Promise<T> {
    const next = this.queue.catch(() => {}).then(action);
    this.queue = next;
    return next;
  }
  open(id: string, url: string) {
    return this.run(() => this.invoke<void>('browser_open', { id, url }));
  }
  action(id: string, action: 'back' | 'forward' | 'reload') {
    return this.run(() => this.invoke<void>('browser_action', { id, action }));
  }
  close(id: string) {
    this.last = '';
    return this.run(() => this.invoke<void>('browser_close', { id }));
  }
  closeAll() {
    this.pending = null;
    this.last = '';
    return this.run(() => this.invoke<void>('browser_close_all'));
  }
  async sync(surfaces: Surface[], nodeIds: string[], pixelRatio = 1) {
    const key = JSON.stringify({ surfaces, nodeIds, pixelRatio });
    if (key === this.last) return;
    this.last = key;
    this.pending = { surfaces, nodeIds };
    if (this.syncing) return;
    this.syncing = true;
    try {
      while (this.pending) {
        const next = this.pending;
        this.pending = null;
        await this.run(() => this.invoke<void>('browser_sync', next));
      }
    } catch (error) {
      this.last = '';
      throw error;
    } finally {
      this.syncing = false;
    }
  }
}
