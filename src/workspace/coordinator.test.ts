import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  createWorkspaceState,
  WorkspaceCoordinator,
  type WorkspacePorts,
} from './coordinator';
import type { LoadedWorkspace, WorkspaceLayout, Catalog } from './model';
import type { Transport } from '../terminal/session';
function doc(id: string): LoadedWorkspace {
  return {
    folder: `C:\\${id}`,
    recovered: false,
    document: {
      version: 1,
      id,
      name: id,
      revision: 0,
      nodes: [
        {
          id: `${id}-terminal`,
          kind: 'terminal',
          title: `${id} agent`,
          shell: 'cmd',
          cwd: 'C:\\repo',
          x: -200,
          y: 72,
          width: 660,
          height: 430,
          z: 1,
          color: '#708f7c',
        },
      ],
      viewport: { x: 30, y: -40, zoom: 0.75 },
      settings: { snapGrid: true },
      edges: [],
    },
  };
}
function harness() {
  const documents = new Map([
    ['one', doc('one')],
    ['two', doc('two')],
  ]);
  let canvas: WorkspaceLayout = {
    nodes: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    settings: { snapGrid: false },
    edges: [],
  };
  let edit = () => {};
  const calls: { command: string; args?: Record<string, unknown> }[] = [];
  let failSave = false;
  let failOpen = false;
  let failStart = false;
  const catalog: Catalog = {
    entries: [...documents.values()].map((w) => ({
      id: w.document.id,
      name: w.document.name,
      folder: w.folder,
    })),
    lastActive: 'one',
    defaultFolder: 'C:\\workspaces',
    recovered: false,
  };
  const invoke: Transport = async <T>(
    command: string,
    args?: Record<string, unknown>,
  ) => {
    calls.push({ command, args });
    if (command === 'workspace_list') return structuredClone(catalog) as T;
    if (command === 'workspace_open') {
      if (failOpen) throw new Error('Corrupt file');
      return structuredClone(documents.get(args!.id as string)) as T;
    }
    if (command === 'workspace_save') {
      if (failSave) throw new Error('Disk full');
      const previous = documents.get(args!.id as string)!;
      const saved = {
        ...previous,
        document: {
          ...previous.document,
          ...structuredClone(args!.layout as WorkspaceLayout),
          revision: previous.document.revision + 1,
        },
      };
      documents.set(previous.document.id, saved);
      return structuredClone(saved) as T;
    }
    return undefined as T;
  };
  const ports: WorkspacePorts = {
    native: true,
    invoke,
    uuid: () => 'new-id',
    capture: () => structuredClone(canvas),
    replace: vi.fn((loaded) => {
      canvas = structuredClone(loaded.document);
    }),
    subscribe: (callback) => {
      edit = callback;
      return () => {};
    },
    prepare: vi.fn(),
    closeAll: vi.fn(async () => {}),
    start: vi.fn(async () => {
      if (failStart) throw new Error('Directory missing');
    }),
  };
  const state = createWorkspaceState();
  const coordinator = new WorkspaceCoordinator(ports, state);
  return {
    coordinator,
    state,
    ports,
    calls,
    documents,
    get canvas() {
      return canvas;
    },
    mutate: (x: number) => {
      canvas = { ...canvas, nodes: canvas.nodes.map((n) => ({ ...n, x })) };
      edit();
    },
    failSave: () => {
      failSave = true;
    },
    failOpen: () => {
      failOpen = true;
    },
    failStart: () => {
      failStart = true;
    },
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
test('startup restores viewport/settings and respawns saved shell/directory once', async () => {
  const h = harness();
  await h.coordinator.initialize();
  await h.coordinator.initialize();
  expect(h.canvas.viewport).toEqual({ x: 30, y: -40, zoom: 0.75 });
  expect(h.canvas.settings.snapGrid).toBe(true);
  expect(h.ports.start).toHaveBeenCalledTimes(1);
  expect(h.ports.start).toHaveBeenCalledWith(
    expect.objectContaining({ shell: 'cmd', cwd: 'C:\\repo' }),
  );
  expect(h.state.getState().phase).toBe('ready');
});
test('switch flushes old edits before opening the target and clears old sessions before restore', async () => {
  const h = harness();
  await h.coordinator.initialize();
  h.calls.length = 0;
  vi.mocked(h.ports.closeAll).mockClear();
  h.mutate(888);
  await h.coordinator.switchTo('two');
  const commands = h.calls.map((c) => c.command);
  expect(commands.indexOf('workspace_save')).toBeLessThan(
    commands.indexOf('workspace_open'),
  );
  expect(h.documents.get('one')!.document.nodes[0].x).toBe(888);
  expect(h.state.getState().active?.document.id).toBe('two');
  expect(h.ports.closeAll).toHaveBeenCalledOnce();
  expect(h.canvas.nodes[0].id).toBe('two-terminal');
});
test('save failure prevents switching and leaves the current terminal untouched', async () => {
  const h = harness();
  await h.coordinator.initialize();
  h.calls.length = 0;
  vi.mocked(h.ports.closeAll).mockClear();
  h.failSave();
  h.mutate(444);
  await expect(h.coordinator.switchTo('two')).rejects.toThrow('Disk full');
  expect(h.ports.closeAll).not.toHaveBeenCalled();
  expect(h.calls.some((c) => c.command === 'workspace_open')).toBe(false);
  expect(h.state.getState().active?.document.id).toBe('one');
  expect(h.canvas.nodes[0].x).toBe(444);
});
test('a corrupt destination is validated before any current terminal is closed', async () => {
  const h = harness();
  await h.coordinator.initialize();
  vi.mocked(h.ports.closeAll).mockClear();
  h.failOpen();
  await expect(h.coordinator.switchTo('two')).rejects.toThrow('Corrupt file');
  expect(h.ports.closeAll).not.toHaveBeenCalled();
  expect(h.state.getState().active?.document.id).toBe('one');
});
test('failed terminal restore retains its layout and allows autosave to continue', async () => {
  const h = harness();
  h.failStart();
  await h.coordinator.initialize();
  expect(h.state.getState().phase).toBe('ready');
  expect(h.state.getState().restoreErrors).toHaveLength(1);
  expect(h.canvas.nodes).toHaveLength(1);
  h.mutate(99);
  await h.coordinator.save();
  expect(h.documents.get('one')!.document.nodes[0].x).toBe(99);
});
test('normal close flushes the last edit and refuses close on a save failure', async () => {
  const h = harness();
  await h.coordinator.initialize();
  h.mutate(987);
  await h.coordinator.prepareToClose();
  expect(h.documents.get('one')!.document.nodes[0].x).toBe(987);
  expect(h.state.getState().closing).toBe(true);
  h.coordinator.cancelClose();
  h.failSave();
  h.mutate(654);
  await expect(h.coordinator.prepareToClose()).rejects.toThrow('Disk full');
  expect(h.state.getState().closing).toBe(false);
});
test('note flush failure blocks switch and normal close even when layout is unchanged', async () => {
  const h = harness();
  await h.coordinator.initialize();
  const flush = vi.fn(async () => {
    throw Error('Note conflict');
  });
  h.ports.flushNotes = flush;
  vi.mocked(h.ports.closeAll).mockClear();
  h.calls.length = 0;
  await expect(h.coordinator.switchTo('two')).rejects.toThrow('Note conflict');
  expect(h.ports.closeAll).not.toHaveBeenCalled();
  expect(h.calls.some((c) => c.command === 'workspace_open')).toBe(false);
  await expect(h.coordinator.prepareToClose()).rejects.toThrow('Note conflict');
  expect(h.state.getState().closing).toBe(false);
});
