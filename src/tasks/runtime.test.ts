import { expect, test } from 'vitest';
import { TaskMutations } from './runtime';
import type { Transport } from '../terminal/session';
test('normal close waits for a task mutation acknowledgement', async () => {
  let resolve!: (value: unknown) => void;
  const response = new Promise((r) => {
    resolve = r;
  });
  const tasks = new TaskMutations((() => response) as Transport);
  const action = tasks.run({});
  let flushed = false;
  const closing = tasks.flush().then(() => {
    flushed = true;
  });
  await Promise.resolve();
  expect(flushed).toBe(false);
  resolve({ ok: true });
  await action;
  await closing;
  expect(flushed).toBe(true);
});
test('a task save failure rejects a concurrent close flush', async () => {
  let reject!: (error: Error) => void;
  const response = new Promise((_, r) => {
    reject = r;
  });
  const tasks = new TaskMutations((() => response) as Transport);
  const action = tasks.run({}).catch(() => {});
  const closing = expect(tasks.flush()).rejects.toThrow('disk full');
  reject(new Error('disk full'));
  await closing;
  await action;
  await expect(tasks.flush()).resolves.toBeUndefined();
});
