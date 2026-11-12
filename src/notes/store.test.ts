import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Notes } from './store';
import type { Transport } from '../terminal/session';
import { parseMarkdown, Markdown } from './markdown';
import { renderToStaticMarkup } from 'react-dom/server';
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function harness() {
  let disk = '# Original';
  const writes: string[] = [];
  const invoke: Transport = async <T>(
    command: string,
    args?: Record<string, unknown>,
  ) => {
    if (command === 'note_read') return disk as T;
    if (args!.expected !== disk) throw Error('External change');
    disk = args!.content as string;
    writes.push(disk);
    return undefined as T;
  };
  const notes = new Notes(invoke),
    entry = notes.entry('workspace', 'notes/test.md');
  return {
    notes,
    entry,
    writes,
    get disk() {
      return disk;
    },
    external: (text: string) => {
      disk = text;
    },
  };
}
test('note edits debounce independently of layout and flush latest draft after view detach', async () => {
  const h = harness();
  await h.notes.load(h.entry);
  h.notes.edit(h.entry, '# First');
  h.notes.edit(h.entry, '# Latest');
  expect(h.notes.snapshot().state).toBe('unsaved');
  await vi.advanceTimersByTimeAsync(599);
  expect(h.writes).toEqual([]);
  await h.notes.flush();
  expect(h.disk).toBe('# Latest');
  expect(h.notes.entry('workspace', 'notes/test.md')).toBe(h.entry);
  expect(h.notes.snapshot().state).toBe('saved');
});
test('external conflict retains draft, blocks flush, and reload uses current disk', async () => {
  const h = harness();
  await h.notes.load(h.entry);
  h.notes.edit(h.entry, 'local draft');
  h.external('external change');
  await expect(h.notes.flush()).rejects.toThrow('External change');
  expect(h.entry.snapshot.content).toBe('local draft');
  expect(h.notes.snapshot().state).toBe('error');
  expect(h.disk).toBe('external change');
  await h.notes.load(h.entry, true);
  expect(h.entry.snapshot.content).toBe('external change');
  h.notes.edit(h.entry, 'merged');
  await h.notes.flush();
  expect(h.disk).toBe('merged');
});
test('reload waits for an in-flight write before reading and cancels unsaved follow-up edits', async () => {
  let finish: () => void = () => {};
  let disk = 'old';
  const invoke: Transport = async <T>(
    command: string,
    args?: Record<string, unknown>,
  ) => {
    if (command === 'note_read') return disk as T;
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    disk = args!.content as string;
    return undefined as T;
  };
  const notes = new Notes(invoke),
    entry = notes.entry('w', 'notes/test.md');
  await notes.load(entry);
  notes.edit(entry, 'writing');
  const saving = notes.flush();
  await Promise.resolve();
  await Promise.resolve();
  notes.edit(entry, 'discarded follow-up');
  const reload = notes.load(entry, true);
  finish();
  await saving;
  await reload;
  expect(entry.snapshot.content).toBe('writing');
  expect(entry.snapshot.state).toBe('saved');
});
test('Markdown preview escapes active content and never creates remote image or link elements', () => {
  const text =
    '# Title\n\n- **Strong**\n- `code`\n\n> Quote\n\n```html\n<script>alert(1)</script>\n```\n\n<img src="https://example.invalid/a">\n![remote](https://example.invalid/a)';
  expect(parseMarkdown(text).map((b) => b.kind)).toContain('code');
  const html = renderToStaticMarkup(Markdown({ text }));
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<img');
  expect(html).not.toContain('<script');
  expect(html).not.toContain('<a ');
});
test('preview work is bounded while the stored draft stays complete', async () => {
  const text = 'line\n'.repeat(20000);
  expect(parseMarkdown(text)).toHaveLength(1000);
  const h = harness();
  await h.notes.load(h.entry);
  h.notes.edit(h.entry, text);
  await h.notes.flush();
  expect(h.disk).toBe(text);
});
