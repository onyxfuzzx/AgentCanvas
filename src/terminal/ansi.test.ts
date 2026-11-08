import { expect, test } from 'vitest';
import { Terminal } from '@xterm/xterm';
const write = (terminal: Terminal, data: string | Uint8Array) =>
  new Promise<void>((resolve) => terminal.write(data, resolve));
test('xterm answers the ConPTY startup cursor query before a view is mounted', async () => {
  const terminal = new Terminal({ cols: 80, rows: 24 });
  const responses: string[] = [];
  terminal.onData((data) => responses.push(data));
  try {
    await write(terminal, '\x1b[6n');
    expect(responses).toContain('\x1b[1;1R');
  } finally {
    terminal.dispose();
  }
});
test('real xterm parser preserves split UTF-8, cursor movement and truecolor', async () => {
  const terminal = new Terminal({ cols: 40, rows: 5, allowProposedApi: true });
  try {
    const bytes = new TextEncoder().encode('界🙂');
    await write(terminal, bytes.slice(0, 2));
    await write(terminal, bytes.slice(2));
    expect(terminal.buffer.active.getLine(0)?.translateToString(true)).toBe(
      '界🙂',
    );
    await write(terminal, '\x1b[2;1H\x1b[38;2;12;34;56mOK\x1b[0m');
    expect(terminal.buffer.active.getLine(1)?.translateToString(true)).toBe(
      'OK',
    );
    expect(terminal.buffer.active.getLine(1)?.getCell(0)?.getFgColor()).toBe(
      0x0c2238,
    );
    await write(terminal, '\x1b[2;1HZ');
    expect(terminal.buffer.active.getLine(1)?.translateToString(true)).toBe(
      'ZK',
    );
  } finally {
    terminal.dispose();
  }
});
test('real xterm reflows scrollback when a node becomes narrower', async () => {
  const terminal = new Terminal({ cols: 20, rows: 5, allowProposedApi: true });
  try {
    await write(terminal, 'abcdefghijklmnopqrstuvwx\r\n');
    terminal.resize(10, 5);
    const lines = Array.from(
      { length: terminal.buffer.active.length },
      (_, i) =>
        terminal.buffer.active.getLine(i)?.translateToString(true) || '',
    );
    expect(lines.join('')).toContain('abcdefghijklmnopqrstuvwx');
    expect(terminal.cols).toBe(10);
  } finally {
    terminal.dispose();
  }
});
