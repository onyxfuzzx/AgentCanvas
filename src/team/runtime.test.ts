import { expect, test } from 'vitest';
import { TeamOperations } from './runtime';
import { parsePlan } from './model';
test('normal close waits for team launch/check/control operations, including a concurrent emergency stop', async () => {
  const queue = new TeamOperations();
  let done!: (value: string) => void;
  const check = queue.track(
    new Promise<string>((resolve) => {
      done = resolve;
    }),
  );
  let stopped = false;
  await queue.track(
    Promise.resolve().then(() => {
      stopped = true;
    }),
  );
  let flushed = false;
  const close = queue.flush().then(() => {
    flushed = true;
  });
  await Promise.resolve();
  expect(stopped).toBe(true);
  expect(flushed).toBe(false);
  done('cancelled');
  await check;
  await close;
  expect(flushed).toBe(true);
});
test('failed team operations reject pending close and can be reconciled without replay', async () => {
  const queue = new TeamOperations();
  let fail!: (error: Error) => void;
  const result = queue
    .track(
      new Promise((_, reject) => {
        fail = reject;
      }),
    )
    .catch(() => {});
  const close = expect(queue.flush()).rejects.toThrow('save failed');
  fail(new Error('save failed'));
  await close;
  await result;
  await expect(queue.flush()).resolves.toBeUndefined();
});
test('proposal editing rejects malformed and oversized inputs before invoking any native operation', () => {
  expect(() => parsePlan('[]')).toThrow();
  expect(() => parsePlan('{"jobs":"execute"}')).toThrow();
  expect(() =>
    parsePlan(JSON.stringify({ jobs: [], goal: 'x'.repeat(128 * 1024) })),
  ).toThrow('128 KiB');
  const draft = parsePlan(
    '{"goal":"Review this before adoption","jobs":[],"checks":[],"repositories":[]}',
  );
  expect(draft.jobs).toEqual([]);
});
