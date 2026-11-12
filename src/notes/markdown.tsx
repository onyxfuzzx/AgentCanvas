import type { ReactNode } from 'react';
export type Block = {
  kind: 'heading' | 'code' | 'quote' | 'list' | 'paragraph' | 'rule';
  text: string;
  level?: number;
};
/** Deliberately small, offline Markdown subset. HTML remains text. */
export function parseMarkdown(text: string): Block[] {
  const lines = text
    .slice(0, 65536)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .slice(0, 1000);
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (/^```/.test(line)) {
      const code: string[] = [];
      while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
      blocks.push({ kind: 'code', text: code.join('\n') });
    } else if (/^(#{1,6}) /.test(line)) {
      const match = /^(#{1,6}) (.*)$/.exec(line)!;
      blocks.push({ kind: 'heading', level: match[1].length, text: match[2] });
    } else if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line))
      blocks.push({ kind: 'rule', text: '' });
    else if (/^> ?/.test(line))
      blocks.push({ kind: 'quote', text: line.replace(/^> ?/, '') });
    else if (/^\s*(?:[-*+] |\d+\. )/.test(line)) {
      const items = [line.replace(/^\s*(?:[-*+] |\d+\. )/, '')];
      while (i + 1 < lines.length && /^\s*(?:[-*+] |\d+\. )/.test(lines[i + 1]))
        items.push(lines[++i].replace(/^\s*(?:[-*+] |\d+\. )/, ''));
      blocks.push({ kind: 'list', text: items.join('\n') });
    } else blocks.push({ kind: 'paragraph', text: line });
  }
  return blocks;
}
function inline(text: string): ReactNode[] {
  const result: ReactNode[] = text
    .slice(0, 4096)
    .split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]*\))/g)
    .map((part, i) => {
      if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
      if (part.startsWith('**'))
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
      const link = /^\[([^\]]+)\]\(([^)]*)\)$/.exec(part);
      return link ? (
        <span key={i} className="markdown-link" title={link[2]}>
          {link[1]}
        </span>
      ) : (
        part
      );
    });
  if (text.length > 4096) result.push(text.slice(4096));
  return result;
}
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown-preview">
      {(text.length > 65536 || text.split('\n', 1001).length > 1000) && (
        <p className="muted">
          Preview truncated. Edit Markdown to see the complete file.
        </p>
      )}
      {parseMarkdown(text).map((b, i) => {
        if (b.kind === 'code')
          return (
            <pre key={i}>
              <code>{b.text}</code>
            </pre>
          );
        if (b.kind === 'rule') return <hr key={i} />;
        if (b.kind === 'heading')
          return (
            <div
              key={i}
              role="heading"
              aria-level={b.level}
              className={`md-heading level-${b.level}`}
            >
              {inline(b.text)}
            </div>
          );
        if (b.kind === 'quote')
          return <blockquote key={i}>{inline(b.text)}</blockquote>;
        if (b.kind === 'list')
          return (
            <ul key={i}>
              {b.text.split('\n').map((s, j) => (
                <li key={j}>{inline(s)}</li>
              ))}
            </ul>
          );
        return <p key={i}>{inline(b.text)}</p>;
      })}
    </div>
  );
}
