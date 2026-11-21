import { afterEach, expect, test, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { NativeHost } from './host';

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), wait: vi.fn() }));
vi.mock('node:child_process', () => ({
  spawn: mocks.spawn,
  execFile: mocks.wait,
}));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
function fixture() {
  const child = Object.assign(new EventEmitter(), {
    pid: 1234,
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => {
      child.emit('close', null);
      return true;
    }),
  });
  mocks.spawn.mockReturnValue(child);
  mocks.wait.mockImplementation((_program, _args, _options, callback) =>
    callback(null, '', ''),
  );
  const failed = vi.fn();
  const host = new NativeHost(
    'backend.exe',
    'data',
    'home',
    () => {},
    failed,
    100,
  );
  return { child, failed, host };
}
test('an unresponsive backend rejects all in-flight calls once and ignores late replies', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const a = expect(f.host.request('workspace_list')).rejects.toThrow(
    'did not answer',
  );
  const b = expect(f.host.request('shells')).rejects.toThrow('did not answer');
  await vi.advanceTimersByTimeAsync(101);
  await Promise.all([a, b]);
  expect(f.failed).toHaveBeenCalledTimes(1);
  f.child.stdout.write('{"id":1,"result":"late"}\n');
  await expect(f.host.request('workspace_list')).rejects.toThrow('closed');
  const stop = f.host.stop();
  await vi.advanceTimersByTimeAsync(5001);
  await stop;
  expect(f.child.kill).toHaveBeenCalledTimes(1);
  expect(mocks.wait).toHaveBeenCalledWith(
    'backend.exe',
    expect.arrayContaining(['--wait-editor', '1234']),
    expect.anything(),
    expect.anything(),
  );
});
test('broken or malformed stdio fails pending work; stop remains idempotent and waits for process confirmation', async () => {
  for (const malformed of [false, true]) {
    const f = fixture();
    const pending = expect(f.host.request('workspace_list')).rejects.toThrow();
    if (malformed) f.child.stdout.write('{not json}\n');
    else f.child.stdin.emit('error', new Error('broken pipe'));
    await pending;
    expect(f.failed).toHaveBeenCalledTimes(1);
    const stop = f.host.stop();
    expect(f.host.stop()).toBe(stop);
    expect(mocks.wait).not.toHaveBeenCalled();
    f.child.emit('close', 1);
    await stop;
    expect(mocks.wait).toHaveBeenCalledTimes(1);
    vi.clearAllMocks();
  }
});
test('a descendant shutdown refusal prevents successful stop', async () => {
  const f = fixture();
  mocks.wait.mockImplementation((_program, _args, _options, callback) =>
    callback(new Error('processes still stopping')),
  );
  const stop = f.host.stop();
  const rejected = expect(stop).rejects.toThrow('processes still stopping');
  f.child.emit('close', 0);
  await rejected;
});
