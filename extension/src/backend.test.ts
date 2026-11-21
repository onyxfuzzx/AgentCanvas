import { expect, test, vi } from 'vitest';
import { Backend, type BackendHost } from './backend';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function fixture() {
  const document = {
    id: 'workspace',
    revision: 1,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    settings: { snapGrid: false },
  };
  let disk = structuredClone(document),
    note = 'base',
    trusted = true;
  const created: {
    host: BackendHost;
    fail: (e: Error) => void;
    requests: string[];
  }[] = [];
  const events: string[] = [],
    preserved: unknown[] = [],
    reload = vi.fn();
  const capture = vi.fn(async () => {});
  let stopGate: Promise<void> | undefined;
  let replyGate: Promise<unknown> | undefined;
  const backend = new Backend({
    trusted: () => trusted,
    changed: () => {},
    capture,
    reload,
    preserve: async (saves) => {
      preserved.push(structuredClone(saves));
      events.push('preserve');
      return 'recovery.json';
    },
    create: (fail) => {
      events.push('create');
      const requests: string[] = [];
      const host: BackendHost = {
        stop: async () => {
          events.push('stop');
          await stopGate;
        },
        request: async (command, args = {}) => {
          requests.push(command);
          if (command === 'workspace_open')
            return { document: structuredClone(disk) };
          if (command === 'workspace_save') {
            disk = {
              ...disk,
              ...structuredClone(args.layout as typeof disk),
              revision: disk.revision + 1,
            };
            return { document: structuredClone(disk) };
          }
          if (command === 'note_read')
            return replyGate ? await replyGate : note;
          if (command === 'note_save') {
            if (args.expected !== note) throw new Error('External note edit');
            note = String(args.content);
          }
          return {};
        },
      };
      created.push({ host, fail, requests });
      return host;
    },
  });
  return {
    backend,
    created,
    events,
    preserved,
    reload,
    capture,
    document,
    setStop: (promise: Promise<void>) => {
      stopGate = promise;
    },
    setReply: (promise: Promise<unknown>) => {
      replyGate = promise;
    },
    setDisk: (value: typeof disk) => {
      disk = value;
    },
    setNote: (value: string) => {
      note = value;
    },
    revoke: () => {
      trusted = false;
    },
  };
}
test('restart preserves drafts, waits for the old process tree, reconciles saves and reloads once', async () => {
  const f = fixture();
  await f.backend.start();
  await f.backend.request('workspace_open', { id: 'workspace' });
  await f.backend.request('workspace_activate', { id: 'workspace' });
  f.backend.checkpoints.update('workspace_save', {
    id: 'workspace',
    layout: { ...f.document, nodes: [{ id: 'new' }] },
  });
  f.backend.checkpoints.update('note_save', {
    workspaceId: 'workspace',
    relativePath: 'notes/n.md',
    expected: 'base',
    content: 'draft',
  });
  const stop = deferred();
  f.setStop(stop.promise);
  const restart = f.backend.restart();
  expect(f.backend.restart()).toBe(restart);
  await vi.waitFor(() => expect(f.events).toContain('stop'));
  expect(f.created).toHaveLength(1);
  expect(f.events.indexOf('preserve')).toBeLessThan(f.events.indexOf('stop'));
  stop.resolve();
  await restart;
  expect(f.created).toHaveLength(2);
  expect(f.backend.state).toMatchObject({
    phase: 'connected',
    generation: 2,
    attempts: 1,
  });
  expect(f.created[1].requests.indexOf('note_save')).toBeLessThan(
    f.created[1].requests.indexOf('workspace_save'),
  );
  expect(f.created[1].requests).not.toContain('terminal_spawn');
  expect(f.created[1].requests).not.toContain('team_control');
  expect(f.backend.checkpoints.snapshot()).toEqual([]);
  expect(f.reload).toHaveBeenCalledExactlyOnceWith(2);
  await f.backend.stop();
});
test('a late result from the replaced backend cannot clear its checkpoint', async () => {
  const f = fixture();
  await f.backend.start();
  const delayed = deferred<unknown>();
  f.setReply(delayed.promise);
  const request = f.backend.request('note_read', {
    workspaceId: 'workspace',
    relativePath: 'notes/n.md',
  });
  const rejected = expect(request).rejects.toThrow('earlier backend');
  await f.backend.restart();
  delayed.resolve('old baseline');
  await rejected;
  expect(f.backend.state.generation).toBe(2);
  await f.backend.stop();
});
test('lost successful saves are reconciled without overwriting external edits', async () => {
  const f = fixture();
  await f.backend.start();
  await f.backend.request('workspace_open', { id: 'workspace' });
  f.backend.checkpoints.update('note_save', {
    workspaceId: 'workspace',
    relativePath: 'notes/n.md',
    expected: 'base',
    content: 'already saved',
  });
  f.setNote('already saved');
  await f.backend.restart();
  expect(f.created[1].requests).not.toContain('note_save');
  f.backend.checkpoints.update('workspace_save', {
    id: 'workspace',
    layout: { ...f.document, nodes: [{ id: 'draft' }] },
  });
  f.setDisk({ ...f.document, revision: 2 });
  await expect(f.backend.restart()).rejects.toThrow('changed on disk');
  expect(f.backend.checkpoints.snapshot()).toHaveLength(1);
  expect(f.backend.state).toMatchObject({
    phase: 'failed',
    recoveryPath: 'recovery.json',
  });
  expect(f.created[2].requests).not.toContain('workspace_save');
  await f.backend.stop();
});
test('partial recovery retains conflicting notes and bounds failed restart attempts', async () => {
  const f = fixture();
  await f.backend.start();
  f.backend.checkpoints.update('note_save', {
    workspaceId: 'workspace',
    relativePath: 'notes/n.md',
    expected: 'base',
    content: 'draft',
  });
  f.setNote('external');
  for (let i = 0; i < 3; i++)
    await expect(f.backend.restart()).rejects.toThrow('External note edit');
  expect(f.backend.checkpoints.snapshot()).toHaveLength(1);
  await expect(f.backend.restart()).rejects.toThrow(
    'Three backend restart attempts',
  );
  expect(f.created).toHaveLength(4);
  expect(f.reload).not.toHaveBeenCalled();
  await f.backend.stop();
});
test('close or trust revocation during restart prevents replacement', async () => {
  for (const close of [false, true]) {
    const f = fixture();
    await f.backend.start();
    const capture = deferred();
    f.capture.mockImplementation(() => capture.promise);
    const restarting = f.backend.restart();
    const rejected = expect(restarting).rejects.toThrow(
      'stopped or workspace trust revoked',
    );
    if (close) {
      const stop = f.backend.stop();
      capture.resolve();
      await stop;
    } else {
      f.revoke();
      capture.resolve();
    }
    await rejected;
    expect(f.created).toHaveLength(1);
    expect(f.reload).not.toHaveBeenCalled();
    await f.backend.stop();
  }
});
test('failure stops the old host and rejects new work until explicit restart', async () => {
  const f = fixture();
  await f.backend.start();
  f.created[0].fail(new Error('broken stdio'));
  expect(f.backend.state.phase).toBe('failed');
  await expect(f.backend.request('workspace_list')).rejects.toThrow(
    'Restart Backend',
  );
  expect(f.events).toContain('stop');
  await f.backend.restart();
  f.created[0].fail(new Error('late old failure'));
  expect(f.backend.state.phase).toBe('connected');
  await f.backend.stop();
});
