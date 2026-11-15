import { useMemo, useState } from 'react';
import { parseDiff } from '../areas/diff';
import { Icon } from './Icon';
const PAGE_SIZE = 500;
/** Text-only Git rendering; paginate large patches so terminal-sized output cannot flood the DOM. */
export function DiffViewer({ diff }: { diff: string }) {
  const files = useMemo(() => parseDiff(diff), [diff]);
  const [selected, setSelected] = useState('');
  const [page, setPage] = useState(0);
  const current = files.find((f) => f.path === selected) ?? files[0];
  if (!current)
    return (
      <div className="diff-empty">
        <Icon name="review" />
        <p>No changes from the base commit.</p>
      </div>
    );
  const pages = Math.max(1, Math.ceil(current.lines.length / PAGE_SIZE));
  const activePage = Math.min(page, pages - 1);
  const additions = files.reduce((sum, f) => sum + f.additions, 0),
    deletions = files.reduce((sum, f) => sum + f.deletions, 0);
  return (
    <section aria-label="Changed files and diff">
      <div className="diff-summary">
        <span>
          {files.length} {files.length === 1 ? 'file' : 'files'} changed
        </span>
        <span className="diff-added">+{additions}</span>
        <span className="diff-deleted">-{deletions}</span>
      </div>
      <div className="diff-layout">
        <nav aria-label="Changed files">
          {files.map((file, i) => (
            <button
              type="button"
              key={`${file.path}-${i}`}
              aria-pressed={file === current}
              className={file === current ? 'on' : ''}
              onClick={() => {
                setSelected(file.path);
                setPage(0);
              }}
            >
              <Icon name="file" />
              <span>{file.path}</span>
              <b className={`file-status file-status-${file.status}`}>
                {file.status}
              </b>
            </button>
          ))}
        </nav>
        <div className="diff-content">
          <div className="diff-file-heading">
            <strong className="diff-filename">{current.path}</strong>
            <span className="diff-added">+{current.additions}</span>
            <span className="diff-deleted">-{current.deletions}</span>
            {current.binary && <span className="task-state">Binary</span>}
          </div>
          {current.oldPath && current.oldPath !== current.path && (
            <p className="page-caption">Previously: {current.oldPath}</p>
          )}
          <div
            key={`${current.path}-${activePage}`}
            className="formatted-diff"
            tabIndex={0}
            role="region"
            aria-label={`Diff for ${current.path}`}
          >
            {current.lines
              .slice(activePage * PAGE_SIZE, (activePage + 1) * PAGE_SIZE)
              .map((line, index) => (
                <div
                  className={`diff-line ${line.kind}`}
                  key={activePage * PAGE_SIZE + index}
                >
                  <span>{line.before ?? ''}</span>
                  <span>{line.after ?? ''}</span>
                  <code>{line.text || ' '}</code>
                </div>
              ))}
          </div>
          {pages > 1 && (
            <div className="diff-pagination">
              <button
                type="button"
                disabled={activePage === 0}
                onClick={() => setPage(activePage - 1)}
              >
                Previous lines
              </button>
              <span role="status">
                Patch page {activePage + 1} of {pages}
              </span>
              <button
                type="button"
                disabled={activePage + 1 === pages}
                onClick={() => setPage(activePage + 1)}
              >
                Next lines
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
