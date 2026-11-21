import {
  spawn,
  execFile,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import {
  Frames,
  frame,
  MAX_PENDING,
  nativeCommands,
  record,
  validId,
} from './protocol';

export class NativeHost {
  private child: ChildProcessWithoutNullStreams;
  private next = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private ended = false;
  private stopping = false;
  private shutdown?: Promise<void>;
  private exited: Promise<void>;
  private session = randomUUID();
  readonly pid: number | undefined;
  constructor(
    private program: string,
    data: string,
    home: string,
    log: (message: string) => void,
    private onFailure: (error: Error) => void = () => {},
    private timeout = 15000,
  ) {
    this.child = spawn(
      program,
      ['--session', this.session, '--data-dir', data, '--home', home],
      {
        windowsHide: true,
        shell: false,
        stdio: 'pipe',
      },
    );
    this.pid = this.child.pid;
    const reader = new Frames((value) => {
      if (!record(value) || !validId(value.id))
        throw new Error('Invalid native reply.');
      if (this.ended) return;
      const request = this.pending.get(value.id);
      if (!request) return;
      this.pending.delete(value.id);
      clearTimeout(request.timer);
      if (typeof value.error === 'string')
        request.reject(new Error(value.error));
      else request.resolve(value.result);
    });
    this.child.stdout.on('data', (chunk: Buffer) => {
      try {
        reader.push(chunk);
      } catch (error) {
        this.fail(new Error(String(error)));
      }
    });
    this.child.stdout.on('end', () => {
      if (!this.stopping)
        this.fail(
          new Error(
            'Canvas backend output closed. Restart Backend to recover.',
          ),
        );
    });
    this.child.stdout.on('error', (error) => this.fail(error));
    // Native diagnostics only; never log requests, terminal output or tokens.
    this.child.stderr.on('data', (chunk: Buffer) =>
      log(chunk.subarray(0, 4096).toString('utf8')),
    );
    this.child.stdin.on('error', (error) => this.fail(error));
    this.child.on('error', (error) => this.fail(error));
    this.exited = new Promise((resolve) =>
      this.child.once('close', (code) => {
        this.fail(
          new Error(
            `Canvas backend stopped (${code ?? 'signal'}). Restart Backend to recover.`,
          ),
        );
        resolve();
      }),
    );
  }
  private fail(error: Error) {
    const first = !this.ended;
    this.ended = true;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    if (first && !this.stopping) this.onFailure(error);
  }
  request(
    command: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    if (!nativeCommands.has(command))
      return Promise.reject(new Error('Unsupported editor command.'));
    if (this.ended)
      return Promise.reject(new Error('Canvas backend is closed.'));
    if (this.pending.size >= MAX_PENDING && command !== 'editor_quiesce')
      return Promise.reject(new Error('Canvas backend request limit reached.'));
    const id = ++this.next;
    let data: string;
    try {
      data = frame({ id, command, args });
    } catch (error) {
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      const limit = /^(area_|team_check_run)/.test(command)
        ? Math.max(this.timeout, 180000)
        : this.timeout;
      const timer = setTimeout(
        () =>
          this.fail(
            new Error(
              `Canvas backend did not answer ${command}. Restart Backend to recover.`,
            ),
          ),
        limit,
      );
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(data, (error) => {
        if (error) this.fail(error);
      });
    });
  }
  async drain() {
    while (this.pending.size)
      await new Promise((resolve) => setTimeout(resolve, 10));
  }
  stop(): Promise<void> {
    if (this.shutdown) return this.shutdown;
    this.stopping = true;
    this.fail(new Error('Canvas backend is stopping.'));
    this.child.stdin.end();
    this.shutdown = (async () => {
      const kill = setTimeout(() => this.child.kill(), 5000);
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          this.exited,
          new Promise<never>((_, reject) => {
            deadline = setTimeout(
              () =>
                reject(
                  new Error('Old backend has not exited; replacement refused.'),
                ),
              12000,
            );
          }),
        ]);
        if (this.pid)
          await promisify(execFile)(
            this.program,
            ['--wait-editor', String(this.pid), this.session],
            { windowsHide: true, timeout: 7000 },
          );
      } finally {
        clearTimeout(kill);
        clearTimeout(deadline);
      }
    })();
    return this.shutdown;
  }
}
