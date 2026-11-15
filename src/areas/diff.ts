export type DiffLine = {
  text: string;
  kind: 'add' | 'del' | 'context' | 'meta';
  before?: number;
  after?: number;
};
export type DiffFile = {
  path: string;
  oldPath?: string;
  status: 'A' | 'D' | 'M' | 'R';
  binary: boolean;
  additions: number;
  deletions: number;
  lines: DiffLine[];
};

/** Decode Git's quoted path format, including octal UTF-8 bytes; never interpret it as markup. */
export function gitPath(value: string): string {
  if (!value.startsWith('"') || !value.endsWith('"')) return value;
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  const raw = value.slice(1, -1);
  for (let i = 0; i < raw.length;) {
    if (raw[i] === '\\') {
      const octal = raw.slice(i + 1).match(/^[0-7]{1,3}/)?.[0];
      if (octal) {
        bytes.push(parseInt(octal, 8));
        i += octal.length + 1;
        continue;
      }
      const next = raw[++i];
      const escapes: Record<string, string> = {
        n: '\n',
        t: '\t',
        r: '\r',
        b: '\b',
        f: '\f',
        v: '\v',
        '\\': '\\',
        '"': '"',
      };
      bytes.push(...encoder.encode(escapes[next] ?? next ?? '\\'));
      i++;
      continue;
    }
    const point = String.fromCodePoint(raw.codePointAt(i)!);
    bytes.push(...encoder.encode(point));
    i += point.length;
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
}
const stripPrefix = (value: string) => gitPath(value).replace(/^[ab]\//, '');
export function parseDiff(diff: string): DiffFile[] {
  return diff
    .split(/(?=^diff --git )/m)
    .filter((part) => part.trim())
    .map((part, index) => {
      const raw = part.split('\n');
      if (raw.at(-1) === '') raw.pop();
      const file: DiffFile = {
        path: `Changes ${index + 1}`,
        status: 'M',
        binary: false,
        additions: 0,
        deletions: 0,
        lines: [],
      };
      // Git quotes paths containing control characters; spaces alone may stay unquoted.
      const header = raw[0]?.match(
        /^diff --git ("(?:\\.|[^"\\])*"|a\/.*?) ("(?:\\.|[^"\\])*"|b\/.*)$/,
      );
      if (header) {
        file.oldPath = stripPrefix(header[1]);
        file.path = stripPrefix(header[2]);
      }
      let oldLine = 0,
        newLine = 0,
        oldRemaining = 0,
        newRemaining = 0;
      for (const text of raw) {
        const hunk = text.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (hunk) {
          oldLine = Number(hunk[1]);
          newLine = Number(hunk[3]);
          oldRemaining = Number(hunk[2] ?? 1);
          newRemaining = Number(hunk[4] ?? 1);
          file.lines.push({ text, kind: 'meta' });
          continue;
        }
        if (oldRemaining || newRemaining) {
          if (text.startsWith('+')) {
            file.lines.push({ text, kind: 'add', after: newLine++ });
            newRemaining = Math.max(0, newRemaining - 1);
            file.additions++;
            continue;
          }
          if (text.startsWith('-')) {
            file.lines.push({ text, kind: 'del', before: oldLine++ });
            oldRemaining = Math.max(0, oldRemaining - 1);
            file.deletions++;
            continue;
          }
          if (text.startsWith(' ')) {
            file.lines.push({
              text,
              kind: 'context',
              before: oldLine++,
              after: newLine++,
            });
            oldRemaining = Math.max(0, oldRemaining - 1);
            newRemaining = Math.max(0, newRemaining - 1);
            continue;
          }
        }
        if (text.startsWith('+++ ') && text !== '+++ /dev/null')
          file.path = stripPrefix(text.slice(4));
        if (text.startsWith('--- ') && text !== '--- /dev/null')
          file.oldPath = stripPrefix(text.slice(4));
        if (text.startsWith('new file mode ')) file.status = 'A';
        if (text.startsWith('deleted file mode ')) file.status = 'D';
        if (text.startsWith('rename from ')) {
          file.oldPath = gitPath(text.slice(12));
          file.status = 'R';
        }
        if (text.startsWith('rename to ')) {
          file.path = gitPath(text.slice(10));
          file.status = 'R';
        }
        if (text.startsWith('Binary files ') || text === 'GIT binary patch')
          file.binary = true;
        file.lines.push({ text, kind: 'meta' });
      }
      return file;
    });
}
