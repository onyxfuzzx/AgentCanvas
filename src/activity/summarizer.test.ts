import { expect, test } from 'vitest';
import { HeuristicActivitySummarizer } from './summarizer';
const bytes = (s: string) => new TextEncoder().encode(s);

test('quiet output is a heuristic, never an asserted completion or input request', () => {
  const s = new HeuristicActivitySummarizer();
  expect(s.summarize({ status: 'running', now: 0 }).text).toBe(
    'No output observed yet',
  );
  s.output(bytes('Building project…'), 1000);
  expect(s.summarize({ status: 'running', now: 2000 })).toMatchObject({
    activity: 'running',
    text: 'Output active',
  });
  expect(s.summarize({ status: 'running', now: 7000 })).toMatchObject({
    activity: 'idle',
    text: 'Quiet for 6s',
  });
  expect(s.summarize({ status: 'running', now: 121000 }).text).toBe(
    'Quiet for 2m',
  );
});

test('explicit prompt patterns are tentative and input clears their evidence without retaining input text', () => {
  const s = new HeuristicActivitySummarizer();
  s.output(bytes('Continue? [Y/n]'), 0);
  expect(s.summarize({ status: 'running', now: 1000 }).text).toBe(
    'Possible input prompt',
  );
  s.input(2000);
  expect(s.summarize({ status: 'running', now: 2000 })).toMatchObject({
    activity: 'running',
    detail: '',
    text: 'Input sent recently',
  });
  s.output(bytes('Task complete\n'), 3000);
  expect(s.summarize({ status: 'running', now: 4000 }).activity).toBe(
    'running',
  );
  expect(s.summarize({ status: 'exited', exitCode: 2, now: 5000 }).text).toBe(
    'Process exited (2)',
  );
});

test('split UTF-8 and ANSI control strings cannot leak into summaries', () => {
  const s = new HeuristicActivitySummarizer();
  const data = bytes('\x1b]52;clipboard-secret\x1b\\\x1b[31m界 ready\x1b[0m');
  for (const byte of data) s.output(new Uint8Array([byte]), 1);
  expect(s.summarize({ status: 'running', now: 2 }).detail).toBe('界 ready');
  s.output(bytes('\r\x1bPprivate-dcs'), 3);
  s.output(bytes('\x1b\\safe\u202eevil'), 4);
  expect(s.summarize({ status: 'running', now: 5 }).detail).toBe('safeevil');
});

test('noisy output, unterminated control strings and resets stay bounded', () => {
  const s = new HeuristicActivitySummarizer();
  for (let i = 0; i < 100; i++) s.output(bytes('x'.repeat(65536)), i);
  expect(s.summarize({ status: 'running', now: 100 }).detail).toHaveLength(160);
  s.reset();
  s.output(bytes('\x1b]52;' + 'secret'.repeat(20000)), 101);
  expect(s.summarize({ status: 'running', now: 102 }).detail).toBe('');
  s.reset();
  expect(s.summarize({ status: 'error', now: 103 }).text).toBe(
    'Terminal needs attention',
  );
  expect(s.summarize({ status: 'running', now: 104 }).detail).toBe('');
});
