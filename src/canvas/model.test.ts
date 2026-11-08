import { beforeEach, expect, test } from 'vitest';
import {
  fitViewport,
  nearViewport,
  snap,
  toWorld,
  zoomAt,
  type CanvasNode,
} from './model';
import { useCanvas } from './store';
const node: CanvasNode = {
  id: 'one',
  kind: 'card',
  title: 'One',
  color: '#fff',
  x: -240,
  y: 80,
  width: 400,
  height: 240,
  z: 1,
};
test('layout undo never removes a newly started terminal process', () => {
  const s = () => useCanvas.getState();
  s().add(node);
  s().add({ ...node, id: 'pty', kind: 'terminal' });
  s().undo();
  expect(s().nodes.map((n) => n.id)).toContain('pty');
  s().redo();
  expect(s().nodes.map((n) => n.id)).toContain('pty');
});
beforeEach(() =>
  useCanvas.setState({ nodes: [], selected: [], past: [], future: [] }),
);
test('workspace hydration replaces layout and clears transient selection and history', () => {
  const s = () => useCanvas.getState();
  s().add(node);
  s().checkpoint();
  s().patch({ one: { x: 999 } });
  s().restore(
    [{ ...node, id: 'restored' }],
    { x: -77, y: 35, zoom: 0.5 },
    true,
  );
  expect(s().selected).toEqual([]);
  expect(s().past).toEqual([]);
  expect(s().future).toEqual([]);
  expect(s().snapGrid).toBe(true);
  s().undo();
  expect(s().nodes[0].id).toBe('restored');
});
test('zoom preserves the world point below the cursor and clamps extremes', () => {
  const v = { x: -850, y: 340, zoom: 0.7 };
  const p = { x: 530, y: 220 };
  const next = zoomAt(v, p, 1.6);
  expect(toWorld(p, next).x).toBeCloseTo(toWorld(p, v).x);
  expect(toWorld(p, next).y).toBeCloseTo(toWorld(p, v).y);
  expect(zoomAt(v, p, 100).zoom).toBe(2);
  expect(zoomAt(v, p, 0.001).zoom).toBe(0.25);
});
test('viewport culling includes the margin and excludes distant nodes', () => {
  expect(nearViewport(node, { x: 0, y: 0, zoom: 1 }, 1000, 800)).toBe(true);
  expect(
    nearViewport({ ...node, x: 5000 }, { x: 0, y: 0, zoom: 1 }, 1000, 800),
  ).toBe(false);
});
test('fit handles negative world coordinates', () => {
  const v = fitViewport([node], 1200, 800);
  expect(node.x * v.zoom + v.x).toBeGreaterThanOrEqual(60);
  expect((node.x + node.width) * v.zoom + v.x).toBeLessThanOrEqual(1140);
  expect(snap(37, true)).toBe(48);
  expect(snap(37, false)).toBe(37);
});
test('a multi-update drag is one undo unit and branching clears redo', () => {
  const s = () => useCanvas.getState();
  s().add(node);
  s().checkpoint();
  s().patch({ one: { x: 100 } });
  s().patch({ one: { x: 200 } });
  s().undo();
  expect(s().nodes[0].x).toBe(-240);
  s().redo();
  expect(s().nodes[0].x).toBe(200);
  s().undo();
  s().add({ ...node, id: 'two' });
  expect(s().future).toHaveLength(0);
});
test('closed PTYs cannot be resurrected through undo or redo', () => {
  const s = () => useCanvas.getState();
  s().add({ ...node, kind: 'terminal' });
  s().checkpoint();
  s().patch({ one: { x: 40 } });
  s().remove(['one']);
  s().undo();
  s().undo();
  expect(s().nodes).toHaveLength(0);
  s().redo();
  expect(s().nodes).toHaveLength(0);
});
