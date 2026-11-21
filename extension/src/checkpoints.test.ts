import { expect, test } from 'vitest';
import { Checkpoints } from './checkpoints';

test('tab close flushes latest note draft before layout, including saves in flight', async () => {
  const checkpoints = new Checkpoints();
  const note = {
    workspaceId: 'workspace',
    relativePath: 'notes/id.md',
    expected: 'old',
    content: 'first',
  };
  checkpoints.update('workspace_save', {
    id: 'workspace',
    layout: { nodes: [] },
  });
  checkpoints.update('note_save', note);
  checkpoints.update('note_save', { ...note, content: 'latest' });
  checkpoints.saved('note_save', note);
  // A new webview edit may arrive before its save continuation observes the reply.
  checkpoints.update('note_save', { ...note, content: 'newest' });
  const calls: unknown[] = [];
  await checkpoints.flush(async (command, args) => {
    calls.push({ command, args: { ...args } });
  });
  expect(calls).toEqual([
    {
      command: 'note_save',
      args: { ...note, expected: 'first', content: 'newest' },
    },
    {
      command: 'workspace_save',
      args: { id: 'workspace', layout: { nodes: [] } },
    },
  ]);
  expect(checkpoints.snapshot()).toEqual([]);
});
test('conflicts retain pending drafts for recovery without marking them saved', async () => {
  const checkpoints = new Checkpoints();
  checkpoints.update('note_save', {
    workspaceId: 'id',
    relativePath: 'notes/id.md',
    expected: 'old',
    content: 'local',
  });
  await expect(
    checkpoints.flush(async () => {
      throw new Error('external edit');
    }),
  ).rejects.toThrow('external edit');
  expect(checkpoints.snapshot()).toHaveLength(1);
  expect(() => checkpoints.update('terminal_write', { data: [1] })).toThrow();
});
test('an older successful layout save cannot clear a more recent layout edit', () => {
  const checkpoints = new Checkpoints();
  const old = { id: 'id', layout: { nodes: [{ x: 0 }] } };
  checkpoints.update('workspace_save', {
    id: 'id',
    layout: { nodes: [{ x: 100 }] },
  });
  checkpoints.saved('workspace_save', old);
  expect(checkpoints.snapshot()[0].args.layout).toEqual({
    nodes: [{ x: 100 }],
  });
});

test('preserved snapshots and received layouts cannot mutate current checkpoints', () => {
  const c = new Checkpoints(),
    args = { id: 'id', layout: { nodes: [{ x: 0 }] } };
  c.update('workspace_save', args);
  args.layout.nodes[0].x = 100;
  const snapshot = c.snapshot();
  (snapshot[0].args.layout as typeof args.layout).nodes[0].x = 200;
  expect(c.snapshot()[0].args.layout).toEqual({ nodes: [{ x: 0 }] });
});
