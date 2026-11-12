import { Autosave, type SaveState } from '../workspace/autosave';
import type { Transport } from '../terminal/session';

export type NoteSnapshot = {
  content: string;
  loaded: boolean;
  state: SaveState;
  error: string;
};
type Entry = {
  workspace: string;
  path: string;
  snapshot: NoteSnapshot;
  listeners: Set<() => void>;
  expected: string;
  queue?: Autosave<string>;
  loading?: Promise<void>;
};
export class Notes {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private summary: { state: SaveState; error: string } = {
    state: 'saved',
    error: '',
  };
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.summary;
  private summarize() {
    const entries = [...this.entries.values()].map((e) => e.snapshot);
    const state: SaveState = entries.some((e) => e.state === 'error')
      ? 'error'
      : entries.some((e) => e.state === 'saving')
        ? 'saving'
        : entries.some((e) => e.state === 'unsaved')
          ? 'unsaved'
          : 'saved';
    const error = entries.find((e) => e.error)?.error ?? '';
    if (this.summary.state === state && this.summary.error === error) return;
    this.summary = { state, error };
    this.listeners.forEach((listener) => listener());
  }
  constructor(private invoke: Transport) {}
  entry(workspace: string, path: string) {
    const key = JSON.stringify([workspace, path]);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        workspace,
        path,
        snapshot: { content: '', loaded: false, state: 'saved', error: '' },
        listeners: new Set(),
        expected: '',
      };
      this.entries.set(key, entry);
    }
    return entry;
  }
  private update(entry: Entry, patch: Partial<NoteSnapshot>) {
    entry.snapshot = { ...entry.snapshot, ...patch };
    entry.listeners.forEach((listener) => listener());
    this.summarize();
  }
  load(entry: Entry, reload = false): Promise<void> {
    if (entry.loading) return entry.loading;
    if (entry.snapshot.loaded && !reload) return Promise.resolve();
    const previous = entry.queue;
    if (reload) {
      previous?.dispose();
      entry.queue = undefined;
    }
    this.update(entry, { loaded: false, error: '' });
    entry.loading = Promise.resolve()
      .then(async () => {
        if (reload) await previous?.settle();
        return this.invoke<string>('note_read', {
          workspaceId: entry.workspace,
          relativePath: entry.path,
        });
      })
      .then((content) => {
        entry.expected = content;
        this.update(entry, {
          content,
          loaded: true,
          state: 'saved',
          error: '',
        });
        entry.queue = new Autosave(
          () => entry.snapshot.content,
          async (content) => {
            await this.invoke('note_save', {
              workspaceId: entry.workspace,
              relativePath: entry.path,
              expected: entry.expected,
              content,
            });
            entry.expected = content;
          },
          (state, error) => this.update(entry, { state, error: error ?? '' }),
          600,
        );
      })
      .catch((error) => {
        this.update(entry, { state: 'error', error: String(error) });
        throw error;
      })
      .finally(() => {
        entry.loading = undefined;
      });
    return entry.loading;
  }
  edit(entry: Entry, content: string) {
    if (!entry.snapshot.loaded) return;
    this.update(entry, { content });
    entry.queue?.dirty();
  }
  async save(entry: Entry) {
    await entry.queue?.flush(true);
  }
  async flush() {
    for (const entry of this.entries.values()) {
      await entry.loading?.catch(() => {});
      await entry.queue?.flush();
    }
  }
  reset() {
    for (const entry of this.entries.values()) entry.queue?.dispose();
    this.entries.clear();
    this.summarize();
  }
}
