import { create } from 'zustand';
import type { CanvasNode, Viewport } from './model';

const LIMIT = 80;
type State = {
  nodes: CanvasNode[];
  selected: string[];
  viewport: Viewport;
  snapGrid: boolean;
  past: CanvasNode[][];
  future: CanvasNode[][];
  setViewport: (v: Viewport) => void;
  select: (ids: string[]) => void;
  checkpoint: () => void;
  patch: (updates: Record<string, Partial<CanvasNode>>) => void;
  add: (node: CanvasNode) => void;
  remove: (ids: string[]) => void;
  undo: () => void;
  redo: () => void;
  toggleSnap: () => void;
  restore: (nodes: CanvasNode[], viewport: Viewport, snapGrid: boolean) => void;
  setTerminalDirectory: (id: string, cwd: string) => void;
};
export const useCanvas = create<State>((set) => ({
  nodes: [],
  selected: [],
  viewport: { x: 72, y: 72, zoom: 1 },
  snapGrid: false,
  past: [],
  future: [],
  setViewport: (viewport) => set({ viewport }),
  select: (selected) => set({ selected }),
  checkpoint: () =>
    set((s) => ({ past: [...s.past, s.nodes].slice(-LIMIT), future: [] })),
  patch: (updates) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        updates[n.id] ? { ...n, ...updates[n.id] } : n,
      ),
    })),
  add: (node) =>
    set((s) => ({
      nodes: [...s.nodes, node],
      selected: [node.id],
      past:
        node.kind === 'terminal'
          ? s.past.map((snapshot) => [...snapshot, node])
          : [...s.past, s.nodes].slice(-LIMIT),
      future: [],
    })),
  remove: (ids) =>
    set((s) => {
      // Process destruction is irreversible: purge closed terminals from every layout snapshot.
      const terminalIds = new Set(
        s.nodes
          .filter((n) => n.kind === 'terminal' && ids.includes(n.id))
          .map((n) => n.id),
      );
      const clean = (nodes: CanvasNode[]) =>
        nodes.filter((n) => !terminalIds.has(n.id));
      return {
        nodes: s.nodes.filter((n) => !ids.includes(n.id)),
        selected: [],
        past: [...s.past.map(clean), clean(s.nodes)].slice(-LIMIT),
        future: [],
      };
    }),
  undo: () =>
    set((s) =>
      s.past.length
        ? {
            nodes: s.past.at(-1)!,
            past: s.past.slice(0, -1),
            future: [s.nodes, ...s.future].slice(0, LIMIT),
            selected: [],
          }
        : {},
    ),
  redo: () =>
    set((s) =>
      s.future.length
        ? {
            nodes: s.future[0],
            past: [...s.past, s.nodes].slice(-LIMIT),
            future: s.future.slice(1),
            selected: [],
          }
        : {},
    ),
  toggleSnap: () => set((s) => ({ snapGrid: !s.snapGrid })),
  restore: (nodes, viewport, snapGrid) =>
    set({ nodes, viewport, snapGrid, selected: [], past: [], future: [] }),
  setTerminalDirectory: (id, cwd) =>
    set((s) => {
      if (s.nodes.find((n) => n.id === id)?.cwd === cwd) return {};
      const patch = (nodes: CanvasNode[]) =>
        nodes.map((n) => (n.id === id ? { ...n, cwd } : n));
      return {
        nodes: patch(s.nodes),
        past: s.past.map(patch),
        future: s.future.map(patch),
      };
    }),
}));
