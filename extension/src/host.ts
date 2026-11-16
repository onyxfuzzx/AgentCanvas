import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
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
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private ended = false;
  private exited: Promise<void>;
  constructor(
    program: string,
    data: string,
    home: string,
    log: (message: string) => void,
  ) {
    this.child = spawn(program, ['--data-dir', data, '--home', home], {
      windowsHide: true,
      shell: false,
      stdio: 'pipe',
    });
    const fail = (error: Error) => {
      this.ended = true;
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
    };
    const reader = new Frames((value) => {
      if (!record(value) || !validId(value.id))
        throw new Error('Invalid native reply.');
      const request = this.pending.get(value.id);
      if (!request) return;
      this.pending.delete(value.id);
      if (typeof value.error === 'string')
        request.reject(new Error(value.error));
      else request.resolve(value.result);
    });
    this.child.stdout.on('data', (chunk: Buffer) => {
      try {
        reader.push(chunk);
      } catch (error) {
        fail(new Error(String(error)));
        this.child.kill();
      }
    });
    // Native diagnostics only. Never log RPC requests, terminal output or tokens.
    this.child.stderr.on('data', (chunk: Buffer) =>
      log(chunk.subarray(0, 4096).toString('utf8')),
    );
    this.child.stdin.on('error', (error) => fail(error));
    this.child.on('error', (error) => fail(error));
    this.exited = new Promise((resolve) =>
      this.child.once('close', (code) => {
        fail(
          new Error(
            `Canvas backend stopped (${code ?? 'signal'}). Reopen the canvas to start fresh processes.`,
          ),
        );
        resolve();
      }),
    );
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
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(data, (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }
  async drain() {
    // Callers first stop accepting new webview requests.
    while (this.pending.size)
      await new Promise((resolve) => setTimeout(resolve, 10));
  }
  async stop() {
    if (!this.ended) {
      this.ended = true;
      this.child.stdin.end();
    }
    const timer = setTimeout(() => this.child.kill(), 5000);
    try {
      await this.exited;
    } finally {
      clearTimeout(timer);
    }
  }
}
