import { useStore } from 'zustand';
import { useCanvas } from '../canvas/store';
import { isDesktop, invoke } from '../native';
import {
  createSession,
  getSession,
  startSession,
  closeAllSessions,
  configureTerminalStartup,
} from '../terminal/registry';
import { createWorkspaceState, WorkspaceCoordinator } from './coordinator';
import { notes } from '../notes/runtime';
import { browsers } from '../browser/runtime';
import {
  collaboration,
  configureCollaboration,
} from '../collaboration/runtime';

export const workspaceState = createWorkspaceState();
export const workspace = new WorkspaceCoordinator(
  {
    native: isDesktop(),
    invoke,
    uuid: () => crypto.randomUUID(),
    capture: () => {
      const state = useCanvas.getState();
      return {
        nodes: state.nodes.map((node) => {
          const base = {
            id: node.id,
            kind: node.kind,
            title: node.title,
            color: node.color,
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
            z: node.z,
          };
          return node.kind === 'terminal'
            ? {
                ...base,
                shell: node.shell,
                cwd: getSession(node.id)?.session.meta.cwd || node.cwd || '',
              }
            : node.kind === 'note'
              ? { ...base, relativePath: node.relativePath }
              : node.kind === 'shape'
                ? { ...base, shape: node.shape }
                : node.kind === 'browser'
                  ? { ...base, url: node.url }
                  : base;
        }),
        viewport: { ...state.viewport },
        settings: { snapGrid: state.snapGrid },
        edges: state.edges,
      };
    },
    replace: (loaded) =>
      useCanvas
        .getState()
        .restore(
          loaded.document.nodes,
          loaded.document.viewport,
          loaded.document.settings.snapGrid,
          loaded.document.edges,
        ),
    subscribe: (onEdit) =>
      useCanvas.subscribe((state, previous) => {
        if (
          state.nodes !== previous.nodes ||
          state.viewport !== previous.viewport ||
          state.snapGrid !== previous.snapGrid ||
          state.edges !== previous.edges
        )
          onEdit();
      }),
    prepare: (nodes) => {
      for (const node of nodes)
        if (node.kind === 'terminal') createSession(node);
    },
    closeAll: async () => {
      await browsers.closeAll();
      await closeAllSessions();
    },
    start: startSession,
    flushNotes: async () => {
      await notes.flush();
      await collaboration.sync();
    },
    resetNotes: () => notes.reset(),
  },
  workspaceState,
);
export const useWorkspace = () => useStore(workspaceState);
configureCollaboration(() => {
  const active = workspaceState.getState().active;
  if (!active) return null;
  const s = useCanvas.getState();
  return {
    workspaceId: active.document.id,
    layout: {
      nodes: s.nodes,
      edges: s.edges,
      viewport: s.viewport,
      settings: { snapGrid: s.snapGrid },
    },
  };
});
configureTerminalStartup(() => collaboration.sync());
useCanvas.subscribe(() => void collaboration.sync().catch(() => {}));
workspaceState.subscribe(() => void collaboration.sync().catch(() => {}));
