import { expect, test } from 'vitest';
import { externalUrl, frame, Frames, MAX_FRAME } from './protocol';

test('pipe frames retain split UTF-8 and multiple messages', () => {
  const results: unknown[] = [];
  const frames = new Frames((value) => results.push(value));
  const data = Buffer.from(
    frame({ id: 1, result: 'hello 🌍' }) + frame({ id: 2, result: null }),
  );
  for (const byte of data) frames.push(Buffer.from([byte]));
  expect(results).toEqual([
    { id: 1, result: 'hello 🌍' },
    { id: 2, result: null },
  ]);
});
test('pipe frame buffers and serialized requests have hard bounds', () => {
  const frames = new Frames(() => {});
  expect(() => frames.push(Buffer.alloc(MAX_FRAME + 1, 120))).toThrow('8 MiB');
  expect(() => frame('x'.repeat(MAX_FRAME))).toThrow('8 MiB');
});
test('browser launch rejects executable schemes, credentials and controls', () => {
  for (const url of [
    'command:workbench.action.closeWindow',
    'file:///C:/secret',
    'javascript:alert(1)',
    'https://user:password@example.com',
    'https://example.com/\n',
  ])
    expect(() => externalUrl(url)).toThrow();
  expect(externalUrl('https://example.com/path?q=1')).toBe(
    'https://example.com/path?q=1',
  );
});
