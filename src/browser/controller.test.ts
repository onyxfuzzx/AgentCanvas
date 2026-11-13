import { expect, test, vi } from 'vitest';
import { BrowserController, type Surface } from './controller';
import type { Transport } from '../terminal/session';

test('surface sync coalesces a slow native consumer to the latest geometry', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls: unknown[] = [];
  const invoke: Transport = vi.fn(async (command, args) => {
    calls.push([command, args]);
    if (calls.length === 1) await gate;
    return undefined as never;
  });
  const controller = new BrowserController(invoke);
  const surface: Surface = {
    id: 'one',
    bounds: { x: 0, y: 0, width: 600, height: 400 },
    clips: [],
    zoom: 1,
  };
  const first = controller.sync([surface], ['one']);
  await Promise.resolve();
  await controller.sync([{ ...surface, zoom: 0.5 }], ['one']);
  await controller.sync([{ ...surface, zoom: 2 }], ['one']);
  release();
  await first;
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual([
    'browser_sync',
    { surfaces: [{ ...surface, zoom: 2 }], nodeIds: ['one'] },
  ]);
});

test('workspace close waits for pending open and never opens saved pages by syncing', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const commands: string[] = [];
  const invoke: Transport = async (command) => {
    commands.push(command);
    if (command === 'browser_open') await gate;
    return undefined as never;
  };
  const controller = new BrowserController(invoke);
  const opening = controller.open('one', 'https://example.com');
  const closing = controller.closeAll();
  await Promise.resolve();
  await Promise.resolve();
  expect(commands).toEqual(['browser_open']);
  release();
  await opening;
  await closing;
  await controller.sync([], ['saved-browser']);
  expect(commands).toEqual([
    'browser_open',
    'browser_close_all',
    'browser_sync',
  ]);
});

test('failed native update is retriable at the same geometry', async () => {
  const invoke = vi
    .fn()
    .mockRejectedValueOnce(new Error('native failure'))
    .mockResolvedValue(undefined);
  const controller = new BrowserController(invoke);
  await expect(controller.sync([], ['one'])).rejects.toThrow('native failure');
  await controller.sync([], ['one']);
  expect(invoke).toHaveBeenCalledTimes(2);
});
