import { expect, test } from 'vitest';
import { launchDirectory } from './directory';
test('canvas storage never masks an editor project default, while managed launches remain pinned', () => {
  expect(
    launchDirectory(true, undefined, 'C:\\canvas-data\\workspace'),
  ).toBeUndefined();
  expect(
    launchDirectory(true, 'C:\\managed\\checkout', 'C:\\canvas-data'),
  ).toBe('C:\\managed\\checkout');
  expect(launchDirectory(false, undefined, 'C:\\canvas-data\\workspace')).toBe(
    'C:\\canvas-data\\workspace',
  );
});
