import { expect, test, vi } from 'vitest';
import { Collaboration, type Graph, visiblePeerText } from './controller';
import { useCanvas } from '../canvas/store';
import type { CanvasNode } from '../canvas/model';
import type { Transport } from '../terminal/session';
const a: CanvasNode = {
  id: 'a',
  kind: 'terminal',
  title: 'A',
  shell: 'cmd',
  cwd: 'C:\\',
  color: '#708f7c',
  x: 0,
  y: 0,
  width: 660,
  height: 430,
  z: 1,
};
const b: CanvasNode = { ...a, id: 'b', title: 'B' };
const note: CanvasNode = {
  ...a,
  id: 'note',
  kind: 'note',
  shell: undefined,
  cwd: undefined,
  relativePath: 'notes/n.md',
};
test('untrusted message logs expose newlines and invisible direction formatting', () => {
  expect(visiblePeerText('hello\n\u202ecommand')).toBe(
    '"hello\\n\\u202ecommand"',
  );
});
test('agent links default to approval, memory links normalize direction, and duplicate links are ignored', () => {
  const s = useCanvas.getState();
  s.restore([a, b, note], { x: 0, y: 0, zoom: 1 }, false);
  s.connect(a.id, b.id);
  s.connect(b.id, a.id);
  s.connect(a.id, note.id);
  expect(useCanvas.getState().edges).toEqual([
    expect.objectContaining({
      kind: 'agent',
      policy: 'approval',
      source: 'a',
      target: 'b',
    }),
    expect.objectContaining({ kind: 'memory', source: 'note', target: 'a' }),
  ]);
  s.setPolicy(useCanvas.getState().edges[0].id, 'auto');
  s.checkpoint();
  s.patch({ a: { x: 100 } });
  s.undo();
  expect(useCanvas.getState().edges[0].policy).toBe('auto');
  s.remove(['note']);
  s.undo();
  expect(useCanvas.getState().nodes.some((n) => n.id === 'note')).toBe(true);
  expect(useCanvas.getState().edges.some((e) => e.kind === 'memory')).toBe(
    false,
  );
});
test('sync coalesces graph changes, ignores geometry, and finishes newest graph before startup continues', async () => {
  let finish = () => {};
  const invoke = vi.fn(async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  let graph: Graph = {
    workspaceId: 'one',
    layout: {
      nodes: [a, b],
      viewport: { x: 0, y: 0, zoom: 1 },
      settings: { snapGrid: false },
      edges: [],
    },
  };
  const controller = new Collaboration(invoke as Transport, () => graph);
  const syncing = controller.sync();
  await Promise.resolve();
  graph = {
    ...graph,
    layout: {
      ...graph.layout,
      edges: [
        {
          id: 'edge',
          source: 'a',
          target: 'b',
          kind: 'agent',
          policy: 'approval',
        },
      ],
    },
  };
  finish();
  await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
  finish();
  await syncing;
  expect(invoke).toHaveBeenCalledTimes(2);
  graph = {
    ...graph,
    layout: { ...graph.layout, nodes: [{ ...a, x: 900 }, b] },
  };
  await controller.sync();
  expect(invoke).toHaveBeenCalledTimes(2);
});
test('failed graph sync surfaces an error and cannot approve a pending message', async () => {
  const invoke = vi.fn(async () => {
    throw Error('Invalid graph');
  });
  const graph: Graph = {
    workspaceId: 'one',
    layout: {
      nodes: [a],
      viewport: { x: 0, y: 0, zoom: 1 },
      settings: { snapGrid: false },
      edges: [],
    },
  };
  const controller = new Collaboration(invoke as Transport, () => graph);
  await expect(controller.decide(1, true)).rejects.toThrow('Invalid graph');
  expect(controller.state.getState().error).toContain('Invalid graph');
  expect(invoke).toHaveBeenCalledTimes(1);
});
