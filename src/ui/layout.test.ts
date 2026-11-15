import { expect, it } from 'vitest';
import { panelInsets } from './layout';
import { fitViewport, type CanvasNode } from '../canvas/model';

it('reserves measured side panels in logical pixels, including an offset viewport', () => {
  expect(
    panelInsets(
      { left: 20, top: 30, right: 1460, bottom: 930 },
      { left: 30, top: 40, right: 270, bottom: 920 },
      { left: 1156, top: 94, right: 1446, bottom: 866 },
    ),
  ).toEqual({ left: 260, right: 310, top: 100, bottom: 70 });
});

it('reserves the actual bottom inspector and compact toolbar without shrinking world geometry', () => {
  const insets = panelInsets(
    { left: 0, top: 0, right: 720, bottom: 720 },
    undefined,
    { left: 14, top: 390, right: 706, bottom: 604 },
  );
  expect(insets).toEqual({ left: 0, right: 0, top: 100, bottom: 336 });
  const node = { x: 100, y: 200, width: 240, height: 140 } as CanvasNode;
  const before = { ...node };
  const fit = fitViewport([node], 720, 720, insets);
  expect(node).toEqual(before);
  expect(node.y * fit.zoom + fit.y).toBeGreaterThanOrEqual(100);
  expect((node.y + node.height) * fit.zoom + fit.y).toBeLessThan(390);
  expect(panelInsets({ left: 0, top: 0, right: 720, bottom: 720 })).toEqual({
    left: 0,
    right: 0,
    top: 100,
    bottom: 116,
  });
});

it('bounds panel reservations when panels lie outside a resized viewport', () => {
  expect(
    panelInsets(
      { left: 0, top: 0, right: 700, bottom: 300 },
      { left: -270, top: 10, right: -30, bottom: 290 },
      { left: 14, top: -20, right: 686, bottom: 184 },
    ),
  ).toEqual({ left: 0, right: 0, top: 100, bottom: 300 });
});
