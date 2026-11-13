import { expect, test } from 'vitest';
import { keyboardLayout } from './keyboard';
import type { CanvasNode } from './model';
const node: CanvasNode = {
  id: 'one',
  kind: 'card',
  title: '',
  color: '#ffffff',
  x: -24,
  y: 9999999,
  width: 320,
  height: 200,
  z: 1,
};
test('keyboard edits selected nodes in world units and clamp saved geometry', () => {
  expect(keyboardLayout([node], ['one'], 'ArrowLeft', false, true)).toEqual({
    one: { x: -48, y: 9999999 },
  });
  expect(keyboardLayout([node], ['one'], 'ArrowDown', false, true)).toEqual({
    one: { x: -24, y: 1e7 },
  });
  expect(keyboardLayout([node], ['one'], 'ArrowLeft', true, true)).toEqual({
    one: { width: 320, height: 200 },
  });
  expect(keyboardLayout([node], ['one'], 'ArrowRight', true, true)).toEqual({
    one: { width: 344, height: 200 },
  });
  expect(keyboardLayout([node], [], 'ArrowRight', false, false)).toEqual({});
  expect(
    keyboardLayout(
      [{ ...node, kind: 'shape', shape: { kind: 'connector' } }],
      ['one'],
      'ArrowRight',
      false,
      false,
    ),
  ).toEqual({});
});
