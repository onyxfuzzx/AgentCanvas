import { expect, test } from 'vitest';
import product from '../product.json';
test('product display name is configured once', () => {
  expect(product.name.trim().length).toBeGreaterThan(0);
});
