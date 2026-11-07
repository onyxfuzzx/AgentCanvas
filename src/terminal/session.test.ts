import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  Session,
  gridSize,
  type Emulator,
  type PollReply,
  type Transport,
} from './session';
import type { CanvasNode } from '../canvas/model';

const node: CanvasNode = {
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'terminal',
  title: 'test',
  shell: 'cmd',
  cwd: 'C:\\',
  color: '#fff',
  x: 0,
  y: 0,
  width: 660,
  height: 430,
  z: 1,
};
function harness(
  handler?: (
    command: string,
    args?: Record<string, unknown>,
  ) => Promise<unknown>,
) {
  const emulator: Emulator = {
    write: vi.fn((_bytes, done) => done()),
    reset: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
  const calls: { command: string; args?: Record<string, unknown> }[] = [];
  const transport: Transport = async <T>(
    command: string,
    args?: Record<string, unknown>,
  ) => {
    calls.push({ command, args });
    if (handler) return (await handler(command, args)) as T;
    if (command === 'terminal_spawn') return { cwd: 'C:\\' } as T;
    if (command === 'terminal_poll')
      return {
        bytes: [],
        dropped: 0,
        exited: false,
        exitCode: null,
        error: null,
      } as T;
    return undefined as T;
  };
  return { emulator, calls, session: new Session(node, emulator, transport) };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
test('concurrent closes dispose once and release a pending parser callback', async () => {
  const h = harness((command) =>
    Promise.resolve(
      command === 'terminal_spawn'
        ? { cwd: 'C:\\' }
        : {
            bytes: [65],
            dropped: 0,
            exited: false,
            exitCode: null,
            error: null,
          },
    ),
  );
  vi.mocked(h.emulator.write).mockImplementation(() => {});
  await h.session.start();
  await vi.advanceTimersByTimeAsync(0);
  await Promise.all([h.session.close(), h.session.close()]);
  expect(h.calls.filter((c) => c.command === 'terminal_close')).toHaveLength(1);
  expect(h.emulator.dispose).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1000);
  expect(h.calls.filter((c) => c.command === 'terminal_poll')).toHaveLength(1);
});
test('viewport entry does not spawn another PTY; hidden sessions poll at 2 Hz', async () => {
  const h = harness();
  await h.session.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.calls.filter((c) => c.command === 'terminal_poll')).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(499);
  expect(h.calls.filter((c) => c.command === 'terminal_poll')).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(h.calls.filter((c) => c.command === 'terminal_poll')).toHaveLength(2);
  h.session.setVisible(true);
  await vi.advanceTimersByTimeAsync(65);
  expect(
    h.calls.filter((c) => c.command === 'terminal_poll').length,
  ).toBeGreaterThan(3);
  expect(h.calls.filter((c) => c.command === 'terminal_spawn')).toHaveLength(1);
  await h.session.close();
});
test('close waits for a pending spawn, then closes exactly that native session', async () => {
  let finish: ((value: unknown) => void) | undefined;
  const h = harness((command) =>
    command === 'terminal_spawn'
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(undefined),
  );
  const start = h.session.start();
  const close = h.session.close();
  expect(h.calls.map((c) => c.command)).toEqual(['terminal_spawn']);
  finish!({ cwd: 'C:\\' });
  await start;
  await close;
  expect(h.calls.map((c) => c.command)).toEqual([
    'terminal_spawn',
    'terminal_close',
  ]);
  expect(h.emulator.dispose).toHaveBeenCalledOnce();
});
test('raw output bytes survive split UTF-8; loss resets the parser and is visible', async () => {
  const replies: PollReply[] = [
    {
      bytes: [0xe7, 0x95],
      dropped: 7,
      exited: false,
      exitCode: null,
      error: null,
    },
    { bytes: [0x8c], dropped: 0, exited: true, exitCode: 3, error: null },
  ];
  const h = harness((command) =>
    Promise.resolve(
      command === 'terminal_spawn' ? { cwd: 'C:\\' } : replies.shift(),
    ),
  );
  await h.session.start();
  await vi.advanceTimersByTimeAsync(500);
  expect(
    vi.mocked(h.emulator.write).mock.calls.map((c) => Array.from(c[0])),
  ).toEqual([[0xe7, 0x95], [0x8c]]);
  expect(h.emulator.reset).toHaveBeenCalledOnce();
  expect(h.session.meta).toMatchObject({
    dropped: 7,
    status: 'exited',
    exitCode: 3,
  });
  await h.session.close();
});
test('large binary input is ordered and split below the native limit', async () => {
  const h = harness();
  await h.session.start();
  const a = Uint8Array.from({ length: 20000 }, (_, i) => i % 256);
  const b = new Uint8Array([255, 0, 13]);
  await Promise.all([h.session.send(a), h.session.send(b)]);
  const chunks = h.calls
    .filter((c) => c.command === 'terminal_write')
    .map((c) => c.args!.data as number[]);
  expect(chunks.every((c) => c.length <= 8192)).toBe(true);
  expect(chunks.flat()).toEqual([...a, ...b]);
  await h.session.close();
});
test('resize bursts coalesce and grid dimensions depend only on world bounds', async () => {
  const h = harness();
  await h.session.start();
  await Promise.all([
    h.session.resize(90, 30),
    h.session.resize(100, 40),
    h.session.resize(110, 45),
  ]);
  const calls = h.calls.filter((c) => c.command === 'terminal_resize');
  expect(calls).toHaveLength(1);
  expect(calls[0].args).toMatchObject({ cols: 110, rows: 45 });
  expect(gridSize(660, 430)).toEqual({ cols: 81, rows: 20 });
  expect(gridSize(10000, 10000)).toEqual({ cols: 500, rows: 300 });
  await h.session.close();
});
test('input and poll failures are surfaced; close errors remain retryable', async () => {
  let attempts = 0;
  const h = harness((command) => {
    if (command === 'terminal_spawn') return Promise.resolve({ cwd: 'C:\\' });
    if (command === 'terminal_close' && attempts++ === 0)
      return Promise.reject('native close failed');
    if (command === 'terminal_write') return Promise.reject('broken pipe');
    return Promise.resolve(undefined);
  });
  await h.session.start();
  await h.session.send(new Uint8Array([13]));
  expect(h.session.meta.error).toContain('broken pipe');
  await expect(h.session.close()).rejects.toBe('native close failed');
  expect(h.emulator.dispose).not.toHaveBeenCalled();
  await h.session.close();
  expect(h.emulator.dispose).toHaveBeenCalledOnce();
});
