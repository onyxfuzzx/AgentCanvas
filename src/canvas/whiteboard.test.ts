import { expect, test } from 'vitest';
import { drawingNode, connectorBounds, connectorPoints } from './whiteboard';
import { useCanvas } from './store';
import type { CanvasNode } from './model';
test('reverse and negative-coordinate strokes normalize and preserve direction through resize', () => {
  const shape = drawingNode(
    'arrow',
    [
      { x: -20, y: 100 },
      { x: -200, y: -50 },
    ],
    'arrow',
    1,
  );
  expect(shape.x).toBe(-208);
  expect(shape.shape!.points![0].x).toBeGreaterThan(shape.shape!.points![1].x);
  const point = shape.shape!.points![0];
  expect(shape.x + point.x * shape.width).toBeCloseTo(-20);
  expect(shape.y + point.y * shape.height).toBeCloseTo(100);
  expect(
    drawingNode(
      'freehand',
      [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ],
      'point',
      1,
    ).width,
  ).toBe(24);
});
const a: CanvasNode = {
  id: 'a',
  kind: 'card',
  title: 'A',
  x: 0,
  y: 0,
  width: 400,
  height: 200,
  z: 1,
  color: '#abcdef',
};
const b: CanvasNode = { ...a, id: 'b', x: 800 };
const c: CanvasNode = {
  ...a,
  id: 'c',
  kind: 'shape',
  shape: { kind: 'connector', source: 'a', target: 'b' },
};
test('attached connector follows endpoint borders and endpoint deletion is undoable', () => {
  const connector = connectorBounds(c, [a, b]);
  const pts = connectorPoints(connector, [a, b]);
  expect(pts.map((p) => p.x + connector.x)).toEqual([400, 800]);
  useCanvas
    .getState()
    .restore([a, b, connector], { x: 0, y: 0, zoom: 1 }, false);
  useCanvas.getState().checkpoint();
  useCanvas.getState().patch({ b: { x: 1200 } });
  expect(useCanvas.getState().nodes[2].width).toBe(816);
  useCanvas.getState().remove(['b']);
  expect(useCanvas.getState().nodes.map((n) => n.id)).toEqual(['a']);
  useCanvas.getState().undo();
  expect(useCanvas.getState().nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
});
test('terminal closure also purges its attached connectors from history', () => {
  useCanvas
    .getState()
    .restore(
      [{ ...a, kind: 'terminal', shell: 'cmd' }, b, c],
      { x: 0, y: 0, zoom: 1 },
      false,
    );
  useCanvas.getState().checkpoint();
  useCanvas.getState().remove(['a']);
  useCanvas.getState().undo();
  expect(useCanvas.getState().nodes.map((n) => n.id)).toEqual(['b']);
});
