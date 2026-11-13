import { expect, test } from 'vitest';
import { browserUrl, visibleRegions, type Rect } from './geometry';

test('partial viewport clipping preserves page coordinates and dimensions', () => {
  const bounds = { x: -200, y: 40, width: 800, height: 600 };
  expect(
    visibleRegions(bounds, { x: 0, y: 0, width: 500, height: 400 }, []),
  ).toEqual([{ x: 200, y: 0, width: 500, height: 360 }]);
  expect(bounds).toEqual({ x: -200, y: 40, width: 800, height: 600 });
});

test('occlusion removes higher nodes without overlaps or leaked pixels', () => {
  const bounds = { x: 100, y: 100, width: 400, height: 300 };
  const covers = [
    { x: 150, y: 180, width: 100, height: 100 },
    { x: 200, y: 220, width: 180, height: 100 },
  ];
  const regions = visibleRegions(
    bounds,
    { x: 0, y: 0, width: 800, height: 600 },
    covers,
  );
  const inside = (x: number, y: number, r: Rect) =>
    x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height;
  for (let y = 0; y < 300; y += 5)
    for (let x = 0; x < 400; x += 5) {
      const expected = !covers.some((r) =>
        inside(x + bounds.x, y + bounds.y, r),
      );
      expect(regions.filter((r) => inside(x, y, r)).length).toBe(
        expected ? 1 : 0,
      );
    }
  expect(visibleRegions(bounds, bounds, [bounds])).toEqual([]);
  expect(
    visibleRegions(bounds, { x: 1000, y: 0, width: 300, height: 300 }, []),
  ).toEqual([]);
});

test('URL input only accepts bounded HTTP(S) without credentials or app origins', () => {
  expect(browserUrl(' https://example.com ')).toBe('https://example.com/');
  expect(browserUrl('http://localhost:3000')).toBe('http://localhost:3000/');
  for (const url of [
    '',
    'example.com',
    'file:///C:/test',
    'javascript:alert(1)',
    'data:text/html,test',
    'https://ipc.localhost',
    'https://user:pass@example.com',
    'https://example.com/\na',
    'https://example.com\\path',
    `https://example.com/${'a'.repeat(4096)}`,
  ])
    expect(() => browserUrl(url)).toThrow();
});
