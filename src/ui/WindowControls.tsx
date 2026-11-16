import { isDesktop, windowAction } from '../native';
import { isEditor } from '../editor';

/** Keep the same native window actions in the sidebar and its floating replacement. */
export function WindowControls({ onClose }: { onClose: () => void }) {
  if (isEditor()) return null;
  return (
    <div className="window-lights" role="group" aria-label="Window controls">
      <button
        className="light-close"
        title="Close application"
        aria-label="Close application"
        disabled={!isDesktop()}
        onClick={onClose}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path d="m3.5 3.5 5 5m0-5-5 5" />
        </svg>
      </button>
      <button
        className="light-minimize"
        title="Minimize"
        aria-label="Minimize"
        disabled={!isDesktop()}
        onClick={() => void windowAction('minimize')}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path d="M3 6h6" />
        </svg>
      </button>
      <button
        className="light-maximize"
        title="Maximize or restore"
        aria-label="Maximize or restore"
        disabled={!isDesktop()}
        onClick={() => void windowAction('toggleMaximize')}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
          <path d="M3 5V3h2M3 3l2.5 2.5M9 7v2H7M9 9 6.5 6.5" />
        </svg>
      </button>
    </div>
  );
}
