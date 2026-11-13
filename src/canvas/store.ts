import { create } from 'zustand';
import type { CanvasNode, Viewport, Connection } from './model';
import { reflow, withoutNodes } from './whiteboard';

const LIMIT = 80;
type State = {
  nodes: CanvasNode[];
  edges: Connection[];
  connect: (source: string, target: string) => void;
  disconnect: (id: string) => void;
  setPolicy: (id: string, policy: Connection['policy']) => void;
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
  restore: (
    nodes: CanvasNode[],
    viewport: Viewport,
    snapGrid: boolean,
    edges?: Connection[],
  ) => void;
  setTerminalDirectory: (id: string, cwd: string) => void;
  setTerminalLaunch: (node: CanvasNode) => void;
};
export const useCanvas = create<State>((set) => ({
  nodes: [],
  edges: [],
  connect: (source, target) =>
    set((s) => {
      const a = s.nodes.find((n) => n.id === source),
        b = s.nodes.find((n) => n.id === target);
      if (
        !a ||
        !b ||
        a.id === b.id ||
        s.edges.length >= 200 ||
        s.edges.some(
          (e) =>
            (e.source === source && e.target === target) ||
            (e.source === target && e.target === source),
        )
      )
        return {};
      if (a.kind === 'terminal' && b.kind === 'terminal')
        return {
          edges: [
            ...s.edges,
            {
              id: crypto.randomUUID(),
              source,
              target,
              kind: 'agent',
              policy: 'approval',
            },
          ],
        };
      if (a.kind === 'terminal' && b.kind === 'note')
        [source, target] = [target, source];
      else if (a.kind !== 'note' || b.kind !== 'terminal') return {};
      return {
        edges: [
          ...s.edges,
          {
            id: crypto.randomUUID(),
            source,
            target,
            kind: 'memory',
            policy: 'approval',
          },
        ],
      };
    }),
  disconnect: (id) =>
    set((s) => ({ edges: s.edges.filter((e) => e.id !== id) })),
  setPolicy: (id, policy) =>
    set((s) => ({
      edges: s.edges.map((e) =>
        e.id === id && e.kind === 'agent' ? { ...e, policy } : e,
      ),
    })),
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
      nodes: reflow(
        s.nodes.map((n) => (updates[n.id] ? { ...n, ...updates[n.id] } : n)),
      ),
    })),
  add: (node) =>
    set((s) =>
      s.nodes.length >= 500
        ? {}
        : {
            nodes: [...s.nodes, node],
            selected: [node.id],
            past:
              node.kind === 'terminal'
                ? s.past.map((snapshot) => [...snapshot, node])
                : [...s.past, s.nodes].slice(-LIMIT),
            future: [],
          },
    ),
  remove: (ids) =>
    set((s) => {
      // Process destruction is irreversible: purge closed terminals from every layout snapshot.
      const terminalIds = new Set(
        s.nodes
          .filter((n) => n.kind === 'terminal' && ids.includes(n.id))
          .map((n) => n.id),
      );
      const clean = (nodes: CanvasNode[]) => withoutNodes(nodes, terminalIds);
      return {
        nodes: withoutNodes(s.nodes, new Set(ids)),
        edges: s.edges.filter(
          (e) => !ids.includes(e.source) && !ids.includes(e.target),
        ),
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
            edges: s.edges.filter(
              (e) =>
                s.past.at(-1)!.some((n) => n.id === e.source) &&
                s.past.at(-1)!.some((n) => n.id === e.target),
            ),
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
            edges: s.edges.filter(
              (e) =>
                s.future[0].some((n) => n.id === e.source) &&
                s.future[0].some((n) => n.id === e.target),
            ),
            past: [...s.past, s.nodes].slice(-LIMIT),
            future: s.future.slice(1),
            selected: [],
          }
        : {},
    ),
  toggleSnap: () => set((s) => ({ snapGrid: !s.snapGrid })),
  restore: (nodes, viewport, snapGrid, edges = []) =>
    set({
      nodes,
      viewport,
      snapGrid,
      edges,
      selected: [],
      past: [],
      future: [],
    }),
  setTerminalLaunch: (node) =>
    set((s) => {
      const patch = (nodes: CanvasNode[]) =>
        nodes.map((n) =>
          n.id === node.id
            ? { ...n, shell: node.shell, cwd: node.cwd, agent: node.agent }
            : n,
        );
      return {
        nodes: patch(s.nodes),
        past: s.past.map(patch),
        future: s.future.map(patch),
      };
    }),
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
