import { useEffect, useRef, useState } from 'react';
import { useDialogFocus } from './useDialogFocus';
import { Icon, type IconName } from './Icon';
export type PaletteAction = {
  label: string;
  detail: string;
  icon: IconName;
  run: () => void;
};
export function CommandPalette({
  actions,
  onClose,
}: {
  actions: PaletteAction[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const results = useRef<HTMLDivElement>(null);
  useEffect(() => {
    results.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [index, query]);
  const ref = useDialogFocus<HTMLElement>(onClose);
  const matches = actions
    .filter((a) =>
      `${a.label} ${a.detail}`.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 13);
  const execute = (i: number) => {
    const action = matches[i];
    if (action) {
      onClose();
      action.run();
    }
  };
  return (
    <div className="modal-backdrop">
      <section
        className="command-palette"
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="palette-search">
          <Icon name="search" />
          <input
            autoFocus
            aria-label="Search commands"
            placeholder="Search views, tasks, notes"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex(Math.max(0, Math.min(index + 1, matches.length - 1)));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex(Math.max(0, index - 1));
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                execute(index);
              }
            }}
          />
          <button onClick={onClose} aria-label="Close command palette">
            <kbd>Esc</kbd>
          </button>
        </div>
        <div className="palette-results" ref={results}>
          {matches.map((a, i) => (
            <button
              key={`${a.detail}-${a.label}-${i}`}
              className={index === i ? 'on' : ''}
              aria-current={index === i ? true : undefined}
              onFocus={() => setIndex(i)}
              onClick={() => execute(i)}
            >
              <Icon name={a.icon} />
              <span>{a.label}</span>
              <small>{a.detail}</small>
            </button>
          ))}
          {!matches.length && (
            <p>Nothing matches. Try a task ID or a note name.</p>
          )}
        </div>
      </section>
    </div>
  );
}
