export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';
/** One writer, bounded pending state, no stale snapshot captured at edit time. */
export class Autosave<T> {
  private version = 0;
  private saved = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private disposed = false;
  private failed = false;
  constructor(
    private capture: () => T,
    private persist: (snapshot: T) => Promise<void>,
    private status: (state: SaveState, error?: string) => void,
    private delay = 750,
  ) {}
  dirty() {
    if (this.disposed) return;
    this.version++;
    if (!this.running && !this.failed) this.status('unsaved');
    if (!this.failed) this.schedule();
  }
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.once().catch(() => {});
    }, this.delay);
  }
  private once(): Promise<void> {
    if (this.running) return this.running;
    if (this.disposed || this.saved === this.version) return Promise.resolve();
    const version = this.version;
    const snapshot = this.capture();
    this.status('saving');
    this.running = Promise.resolve()
      .then(() => this.persist(snapshot))
      .then(() => {
        this.saved = version;
        this.failed = false;
        if (!this.disposed)
          this.status(this.saved === this.version ? 'saved' : 'unsaved');
      })
      .catch((error) => {
        this.failed = true;
        if (!this.disposed) this.status('error', String(error));
        throw error;
      })
      .finally(() => {
        this.running = undefined;
        if (!this.disposed && !this.failed && this.saved !== this.version)
          this.schedule();
      });
    return this.running;
  }
  async flush(force = false) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (force && this.version === this.saved) this.version++;
    while (!this.disposed && this.saved !== this.version) await this.once();
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
