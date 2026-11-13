import type { CanvasNode } from '../canvas/model';
import {
  HeuristicActivitySummarizer,
  type ActivitySummarizer,
  type ActivitySummary,
} from '../activity/summarizer';

export interface Emulator {
  write(bytes: Uint8Array, callback: () => void): void;
  reset(): void;
  resize(cols: number, rows: number): void;
  dispose(): void;
}
export type Transport = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;
export type SessionMeta = {
  status: 'paused' | 'starting' | 'running' | 'exited' | 'error';
  activity: 'idle' | 'running' | 'waiting';
  manualActivity: boolean;
  summary: ActivitySummary;
  error?: string;
  exitCode?: number;
  dropped: number;
  cwd: string;
  cols: number;
  rows: number;
};
export type PollReply = {
  bytes: number[];
  dropped: number;
  exited: boolean;
  exitCode: number | null;
  error: string | null;
};
export function gridSize(
  width: number,
  height: number,
  cellWidth = 7.83,
  cellHeight = 17,
) {
  return {
    cols: Math.max(2, Math.min(500, Math.floor((width - 22) / cellWidth))),
    rows: Math.max(1, Math.min(300, Math.floor((height - 77) / cellHeight))),
  };
}

// Neither this session nor the native process is owned by a React mount.
export class Session {
  meta: SessionMeta;
  visible = false;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  private ready: Promise<void> | undefined;
  private input: Promise<void> = Promise.resolve();
  private pendingInput = 0;
  private resizeChain: Promise<void> = Promise.resolve();
  private version = 0;
  private deliveredVersion = 0;
  private pollPending = false;
  private finishParse: (() => void) | undefined;
  private closing: Promise<void> | undefined;
  private lastSummary = 0;
  constructor(
    readonly node: CanvasNode,
    readonly emulator: Emulator,
    private transport: Transport,
    private summarizer: ActivitySummarizer = new HeuristicActivitySummarizer(),
  ) {
    this.meta = {
      status: node.agent ? 'paused' : 'starting',
      activity: node.agent ? 'idle' : 'running',
      manualActivity: false,
      summary: this.summarizer.summarize({
        status: node.agent ? 'paused' : 'starting',
        now: Date.now(),
      }),
      dropped: 0,
      cwd: node.cwd || '',
      ...gridSize(node.width, node.height),
    };
    emulator.resize(this.meta.cols, this.meta.rows);
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.meta;
  setActivity(activity: SessionMeta['activity']) {
    if (this.meta.status === 'running')
      this.update({ activity, manualActivity: true });
  }
  useAutomaticActivity() {
    this.update({ manualActivity: false });
    this.summarize(true);
  }
  private summarize(force = false) {
    const now = Date.now();
    if (!force && now - this.lastSummary < 1000) return;
    this.lastSummary = now;
    const summary = this.summarizer.summarize({
      status: this.meta.status,
      exitCode: this.meta.exitCode,
      now,
    });
    if (
      summary.text !== this.meta.summary.text ||
      summary.detail !== this.meta.summary.detail ||
      summary.activity !== this.meta.summary.activity ||
      (!this.meta.manualActivity && this.meta.activity !== summary.activity)
    )
      this.update({
        summary,
        ...(!this.meta.manualActivity ? { activity: summary.activity } : {}),
      });
  }
  private update(patch: Partial<SessionMeta>) {
    this.meta = { ...this.meta, ...patch };
    for (const listener of this.listeners) listener();
  }
  reportError(error: unknown) {
    this.update({ status: 'error', error: String(error) });
    this.summarize(true);
  }
  warn(error: unknown) {
    this.update({ error: String(error) });
  }
  start(launchNode = this.node) {
    if (this.ready) return this.ready;
    this.update({ status: 'starting' });
    this.summarize(true);
    this.ready = this.transport<{ cwd: string }>('terminal_spawn', {
      id: this.node.id,
      shell: launchNode.shell,
      cwd: this.meta.cwd,
      cols: this.meta.cols,
      rows: this.meta.rows,
      ...(launchNode.agent
        ? { agent: { name: launchNode.title, settings: launchNode.agent } }
        : {}),
    })
      .then((result) => {
        this.update({ cwd: result.cwd, status: 'running', error: undefined });
        this.summarize(true);
        if (!this.closed) this.schedule(0);
      })
      .catch((error) => {
        this.reportError(error);
        throw error;
      });
    return this.ready;
  }
  setVisible(visible: boolean) {
    this.visible = visible;
    if (visible && this.meta.status === 'running' && !this.closed)
      this.schedule(0);
  }
  private schedule(delay: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.poll();
    }, delay);
  }
  private async poll() {
    if (this.closed || this.pollPending || this.meta.status !== 'running')
      return;
    this.pollPending = true;
    try {
      const reply = await this.transport<PollReply>('terminal_poll', {
        id: this.node.id,
        maxBytes: this.visible ? 32768 : 65536,
      });
      if (this.closed) return;
      if (reply.dropped) {
        this.emulator.reset();
        this.summarizer.reset();
        this.update({ dropped: this.meta.dropped + reply.dropped });
      }
      if (reply.bytes.length) {
        this.summarizer.output(Uint8Array.from(reply.bytes), Date.now());
        await new Promise<void>((resolve) => {
          this.finishParse = resolve;
          this.emulator.write(Uint8Array.from(reply.bytes), () => {
            this.finishParse = undefined;
            resolve();
          });
        });
      }
      if (this.closed) return;
      if (reply.exited)
        this.update({
          status: 'exited',
          exitCode: reply.exitCode ?? undefined,
          error: reply.error ?? undefined,
        });
      else if (reply.error) this.reportError(reply.error);
      this.summarize(reply.exited);
    } catch (error) {
      if (!this.closed) this.reportError(error);
    } finally {
      this.pollPending = false;
      if (!this.closed && this.meta.status === 'running')
        this.schedule(this.visible ? 32 : 500);
    }
  }
  send(bytes: Uint8Array) {
    if (
      this.closed ||
      this.meta.status === 'paused' ||
      this.meta.status === 'exited' ||
      this.meta.status === 'error'
    )
      return Promise.resolve();
    if (this.pendingInput + bytes.length > 1024 * 1024) {
      this.update({
        error: 'Input queue is full; paste at most 1 MiB at a time.',
      });
      return Promise.resolve();
    }
    this.pendingInput += bytes.length;
    const copy = bytes.slice();
    this.input = this.input
      .then(async () => {
        await this.ready;
        for (
          let offset = 0;
          offset < copy.length && !this.closed;
          offset += 8192
        ) {
          await this.transport('terminal_write', {
            id: this.node.id,
            data: Array.from(copy.subarray(offset, offset + 8192)),
          });
          this.summarizer.input(Date.now());
          this.summarize();
        }
      })
      .catch((error) => {
        if (!this.closed) this.reportError(error);
      })
      .finally(() => {
        this.pendingInput -= bytes.length;
      });
    return this.input;
  }
  resize(cols: number, rows: number) {
    if (this.closed || (cols === this.meta.cols && rows === this.meta.rows))
      return this.resizeChain;
    this.update({ cols, rows });
    this.emulator.resize(cols, rows);
    this.version++;
    // Serialize native calls and coalesce rapid pointer-driven changes.
    this.resizeChain = this.resizeChain
      .then(async () => {
        // A restored renderer can measure before its bounded startup worker
        // starts the shell. Spawn will already use these latest dimensions.
        if (!this.ready) return;
        await this.ready;
        if (this.closed || this.deliveredVersion === this.version) return;
        const version = this.version;
        await this.transport('terminal_resize', {
          id: this.node.id,
          cols: this.meta.cols,
          rows: this.meta.rows,
        });
        this.deliveredVersion = version;
      })
      .catch((error) => {
        if (!this.closed) this.reportError(error);
      });
    return this.resizeChain;
  }
  private stopping: Promise<void> | undefined;
  stop() {
    if (this.closing) return this.closing;
    if (this.stopping) return this.stopping;
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.finishParse?.();
    this.finishParse = undefined;
    this.stopping = (async () => {
      await this.ready?.catch(() => {});
      await this.transport('terminal_close', { id: this.node.id });
      this.summarizer.reset();
      this.update({ status: 'exited', error: undefined });
      this.summarize(true);
    })().catch((error) => {
      this.stopping = undefined;
      this.reportError(error);
      throw error;
    });
    return this.stopping;
  }
  close() {
    if (this.closing) return this.closing;
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.finishParse?.();
    this.finishParse = undefined;
    this.closing = (async () => {
      await this.stopping?.catch(() => {});
      await this.ready?.catch(() => {});
      await this.transport('terminal_close', { id: this.node.id });
      this.emulator.dispose();
      this.summarizer.reset();
      this.listeners.clear();
    })().catch((error) => {
      this.closing = undefined;
      throw error;
    });
    return this.closing;
  }
}
