import { expect, test } from 'vitest';
import { SetupPreferences } from './setup';
test('first-run completion is explicit, versioned and survives another preference reader', async () => {
  let value: unknown = undefined;
  const storage = {
    get: () => value,
    update: async (_key: string, next: unknown) => {
      value = next;
    },
  };
  const setup = new SetupPreferences(storage);
  expect(setup.get().completed).toBe(false);
  expect(await setup.complete()).toEqual({ version: 1, completed: true });
  expect(new SetupPreferences(storage).get().completed).toBe(true);
  for (const invalid of [
    'true',
    { version: 1, completed: 'true' },
    { version: 2, completed: true },
  ]) {
    value = invalid;
    expect(setup.get().completed).toBe(false);
  }
});
test('a failed preference write cannot report setup complete', async () => {
  const setup = new SetupPreferences({
    get: () => undefined,
    update: async () => {
      throw new Error('write failed');
    },
  });
  await expect(setup.complete()).rejects.toThrow('write failed');
  expect(setup.get().completed).toBe(false);
});
