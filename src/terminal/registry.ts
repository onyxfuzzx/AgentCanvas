import { Terminal } from '@xterm/xterm';
import type { CanvasNode } from '../canvas/model';
import { invoke } from '../native';
import { Session } from './session';

type Entry = {
  session: Session;
  terminal: Terminal;
  opened: boolean;
  cellWidth: number;
  cellHeight: number;
};
const sessions = new Map<string, Entry>();
export function createSession(node: CanvasNode): Entry {
  const existing = sessions.get(node.id);
  if (existing) return existing;
  const terminal = new Terminal({
    fontFamily: 'Consolas, "Cascadia Mono", monospace',
    fontSize: 13,
    lineHeight: 1,
    scrollback: 2000,
    cursorBlink: true,
    allowProposedApi: false,
    theme: {
      background: '#171a1e',
      foreground: '#d2d8df',
      cursor: '#d4b080',
      selectionBackground: '#53627380',
    },
  });
  const session = new Session(node, terminal, invoke);
  // No OSC 52 clipboard access from untrusted process output.
  terminal.parser.registerOscHandler(52, () => true);
  terminal.onData((data) => void session.send(new TextEncoder().encode(data)));
  terminal.onBinary(
    (data) =>
      void session.send(Uint8Array.from(data, (c) => c.charCodeAt(0) & 255)),
  );
  terminal.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown') return true;
    if (
      (event.ctrlKey && event.shiftKey && event.code === 'KeyC') ||
      (event.ctrlKey && event.code === 'KeyC' && terminal.hasSelection())
    ) {
      event.preventDefault();
      void navigator.clipboard
        .writeText(terminal.getSelection())
        .catch((error) => session.warn(error));
      return false;
    }
    if (event.ctrlKey && event.shiftKey && event.code === 'KeyV') {
      event.preventDefault();
      void navigator.clipboard
        .readText()
        .then((text) => terminal.paste(text))
        .catch((error) => session.warn(error));
      return false;
    }
    return true;
  });
  const entry = {
    session,
    terminal,
    opened: false,
    cellWidth: 7.83,
    cellHeight: 17,
  };
  sessions.set(node.id, entry);
  return entry;
}
export const getSession = (id: string) => sessions.get(id);
export async function closeSession(id: string) {
  const entry = sessions.get(id);
  if (!entry) return;
  await entry.session.close();
  sessions.delete(id);
}
