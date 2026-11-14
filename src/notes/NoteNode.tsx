import { useEffect, useState, useSyncExternalStore } from 'react';
import type { CanvasNode } from '../canvas/model';
import { notes } from './runtime';
import { Markdown } from './markdown';
export function NoteNode({
  node,
  workspaceId,
  visible,
}: {
  node: CanvasNode;
  workspaceId: string;
  visible: boolean;
}) {
  const entry = notes.entry(workspaceId, node.relativePath!);
  const snapshot = useSyncExternalStore(
    (listener) => {
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    () => entry.snapshot,
  );
  const [editing, setEditing] = useState(true);
  const [confirmReload, setConfirmReload] = useState(false);
  useEffect(() => {
    if (visible) void notes.load(entry).catch(() => {});
  }, [entry, visible]);
  return (
    <div className="note-body" onPointerDown={(e) => e.stopPropagation()}>
      <div className="note-tools">
        <button
          disabled={!snapshot.loaded}
          onClick={() => setEditing(!editing)}
        >
          {editing ? 'Preview' : 'Edit Markdown'}
        </button>
        <button
          disabled={!snapshot.loaded}
          onClick={() => void notes.save(entry).catch(() => {})}
        >
          {snapshot.state === 'error'
            ? 'Retry save'
            : snapshot.state === 'saving'
              ? 'Saving…'
              : snapshot.state === 'unsaved'
                ? 'Save note'
                : 'Saved'}
        </button>
        <button
          title="Read external changes from disk"
          onClick={() => {
            if (snapshot.state !== 'saved') setConfirmReload(true);
            else void notes.load(entry, true).catch(() => {});
          }}
        >
          Reload disk
        </button>
      </div>
      {snapshot.error && (
        <p className="note-error" role="alert">
          {snapshot.error}
        </p>
      )}
      {confirmReload && (
        <div className="note-error">
          Reload replaces this draft. Copy your edits first if needed.
          <button
            onClick={() => {
              setConfirmReload(false);
              void notes.load(entry, true).catch(() => {});
            }}
          >
            Replace draft from disk
          </button>
          <button onClick={() => setConfirmReload(false)}>Keep draft</button>
        </div>
      )}
      {visible && snapshot.loaded ? (
        editing ? (
          <textarea
            aria-label={`Markdown for ${node.title}`}
            spellCheck={false}
            value={snapshot.content}
            onChange={(e) => notes.edit(entry, e.target.value)}
          />
        ) : (
          <Markdown text={snapshot.content} />
        )
      ) : visible && snapshot.content ? (
        <textarea
          aria-label={`Retained draft for ${node.title}`}
          readOnly
          value={snapshot.content}
        />
      ) : (
        <div className="note-placeholder">
          {snapshot.error
            ? 'Note unavailable'
            : visible
              ? 'Loading note…'
              : 'Markdown note'}
        </div>
      )}
      <div className="note-path" title={node.relativePath}>
        {node.relativePath}
      </div>
    </div>
  );
}
