import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { Autosave, type SaveState } from './autosave';
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
test('autosave debounces edits and captures the newest layout, not the first edit', async () => {
  let x = 1;
  const persist = vi.fn(async () => {});
  const status = vi.fn();
  const queue = new Autosave(() => ({ x }), persist, status);
  queue.dirty();
  await vi.advanceTimersByTimeAsync(600);
  x = 2;
  queue.dirty();
  await vi.advanceTimersByTimeAsync(749);
  expect(persist).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(persist).toHaveBeenCalledWith({ x: 2 });
  expect(status).toHaveBeenLastCalledWith('saved');
  queue.dispose();
});
test('an edit arriving during a write is saved in order and flush waits for both', async () => {
  let x = 1;
  let finish: (() => void) | undefined;
  const snapshots: number[] = [];
  const persist = vi.fn(async (snapshot: { x: number }) => {
    snapshots.push(snapshot.x);
    if (snapshots.length === 1)
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
  });
  const queue = new Autosave(
    () => ({ x }),
    persist,
    () => {},
  );
  queue.dirty();
  await vi.advanceTimersByTimeAsync(750);
  x = 2;
  queue.dirty();
  await vi.advanceTimersByTimeAsync(750);
  expect(snapshots).toEqual([1]);
  const flushed = queue.flush();
  finish!();
  await flushed;
  expect(snapshots).toEqual([1, 2]);
  queue.dispose();
});
test('a failed save keeps dirty state, pauses automatic retries and supports explicit retry', async () => {
  let x = 1;
  const states: SaveState[] = [];
  const persist = vi
    .fn()
    .mockRejectedValueOnce(new Error('Disk full'))
    .mockResolvedValue(undefined);
  const queue = new Autosave(
    () => ({ x }),
    persist,
    (state) => states.push(state),
  );
  queue.dirty();
  await vi.advanceTimersByTimeAsync(750);
  expect(states.at(-1)).toBe('error');
  x = 2;
  queue.dirty();
  await vi.advanceTimersByTimeAsync(5000);
  expect(persist).toHaveBeenCalledTimes(1);
  await queue.flush();
  expect(persist).toHaveBeenLastCalledWith({ x: 2 });
  expect(states.at(-1)).toBe('saved');
  queue.dispose();
});
test('disposing a queue cancels timers and suppresses stale completion notifications', async () => {
  let finish: (() => void) | undefined;
  const status = vi.fn();
  const persist = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const queue = new Autosave(() => 1, persist, status);
  queue.dirty();
  await vi.advanceTimersByTimeAsync(750);
  queue.dirty();
  queue.dispose();
  const count = status.mock.calls.length;
  finish!();
  await vi.advanceTimersByTimeAsync(5000);
  expect(persist).toHaveBeenCalledTimes(1);
  expect(status.mock.calls.length).toBe(count);
});
