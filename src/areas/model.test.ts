import { beforeEach, expect, test } from 'vitest';
import { inArea } from './model';
import { useCanvas } from '../canvas/store';
import { TaskMutations } from '../tasks/runtime';
import type { Transport } from '../terminal/session';
const node = {
  id: 'one',
  kind: 'terminal' as const,
  title: 'Builder',
  color: '#708f7c',
  x: -120,
  y: 250,
  width: 660,
  height: 430,
  z: 1,
};
beforeEach(() =>
  useCanvas.getState().restore([], { x: 72, y: 72, zoom: 1 }, false),
);
test('area scope preserves world coordinates and all processes across view changes and undo', () => {
  const s = () => useCanvas.getState();
  s().setAreaScope('a', 'C:\\area a');
  s().add(node);
  s().setAreaScope('b', 'C:\\area b');
  s().add({ ...node, id: 'two' });
  expect(
    s()
      .nodes.filter((n) => inArea(n, s().areaScope))
      .map((n) => n.id),
  ).toEqual(['two']);
  s().undo();
  expect(s().nodes).toHaveLength(2);
  s().setAreaScope('a', 'C:\\area a');
  expect(s().nodes[0]).toMatchObject({ areaId: 'a', x: -120, y: 250 });
  s().setAreaScope(null);
  expect(s().nodes.filter((n) => inArea(n, null))).toHaveLength(2);
  expect(s().areaDirectory).toBe('');
  s().restore(s().nodes, { x: 1, y: 1, zoom: 1 }, false);
  expect(s().areaScope).toBeNull();
  expect(s().nodes[0].areaId).toBe('a');
});
test('normal close and switching wait for a Git mutation without replaying it', async () => {
  let done!: (value: unknown) => void;
  const result = new Promise((r) => {
    done = r;
  });
  const calls: string[] = [];
  const mutations = new TaskMutations(
    ((command: string) => {
      calls.push(command);
      return result;
    }) as Transport,
    'area_action',
  );
  const action = mutations.run({ action: { type: 'integrate' } });
  let closed = false;
  const flush = mutations.flush().then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  done({});
  await action;
  await flush;
  expect(closed).toBe(true);
  expect(calls).toEqual(['area_action']);
});
