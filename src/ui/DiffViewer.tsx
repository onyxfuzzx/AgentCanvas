import { useState } from 'react';
/** Render Git's bounded plain-text diff as text; filenames and source are untrusted. */
export function DiffViewer({ diff }: { diff: string }) {
  const [selected, setSelected] = useState('');
  const sections = diff
    .split(/(?=^diff --git )/m)
    .filter(Boolean)
    .map((text, index) => {
      const match =
        text.match(/^\+\+\+ (?:b\/)?(.+)$/m) ??
        text.match(/^diff --git a\/(.+) b\//m);
      return {
        id: String(index),
        name: match?.[1] ?? 'Changes',
        lines: text.split('\n'),
      };
    });
  const current = sections.find((s) => s.id === selected) ?? sections[0];
  if (!current) return <p className="page-caption">No diff from base.</p>;
  let oldLine = 0,
    newLine = 0;
  return (
    <div className="diff-layout">
      <nav aria-label="Changed files">
        {sections.map((s) => (
          <button
            key={s.id}
            className={s.id === current.id ? 'on' : ''}
            onClick={() => setSelected(s.id)}
          >
            {s.name}
          </button>
        ))}
      </nav>
      <div>
        <p className="diff-filename">{current.name}</p>
        <div
          className="formatted-diff"
          tabIndex={0}
          role="region"
          aria-label={`Diff for ${current.name}`}
        >
          {current.lines.map((line, i) => {
            const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/);
            if (hunk) {
              oldLine = Number(hunk[1]);
              newLine = Number(hunk[2]);
            }
            const kind =
              line.startsWith('+') && !line.startsWith('+++')
                ? 'add'
                : line.startsWith('-') && !line.startsWith('---')
                  ? 'del'
                  : line.startsWith(' ')
                    ? 'context'
                    : 'meta';
            const before =
              kind === 'del' || kind === 'context' ? oldLine++ : '';
            const after = kind === 'add' || kind === 'context' ? newLine++ : '';
            return (
              <div className={`diff-line ${kind}`} key={i}>
                <span>{before}</span>
                <span>{after}</span>
                <code>{line || ' '}</code>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
