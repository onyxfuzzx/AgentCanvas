import { createStore, type StoreApi } from 'zustand/vanilla';
import { Autosave, type SaveState } from './autosave';
import type {
  Catalog,
  LoadedWorkspace,
  WorkspaceLayout,
  WorkspaceEntry,
} from './model';
import type { CanvasNode } from '../canvas/model';
import type { Transport } from '../terminal/session';

export type WorkspaceState = {
  phase: 'loading' | 'ready' | 'switching' | 'restoring' | 'error';
  active: LoadedWorkspace | null;
  entries: WorkspaceEntry[];
  defaultFolder: string;
  saveState: SaveState;
  error: string;
  recovered: boolean;
  restoreErrors: string[];
  closing: boolean;
};
export const createWorkspaceState = () =>
  createStore<WorkspaceState>(() => ({
    phase: 'loading',
    active: null,
    entries: [],
    defaultFolder: '',
    saveState: 'saved',
    error: '',
    recovered: false,
    restoreErrors: [],
    closing: false,
  }));
export interface WorkspacePorts {
  native: boolean;
  invoke: Transport;
  uuid: () => string;
  capture: () => WorkspaceLayout;
  replace: (workspace: LoadedWorkspace) => void;
  subscribe: (onEdit: () => void) => () => void;
  prepare: (nodes: CanvasNode[]) => void;
  closeAll: () => Promise<void>;
  start: (node: CanvasNode) => Promise<void>;
}
export class WorkspaceCoordinator {
  private queue: Autosave<WorkspaceLayout> | undefined;
  private operation: Promise<void> | undefined;
  private initialized: Promise<void> | undefined;
  constructor(
    private ports: WorkspacePorts,
    readonly state: StoreApi<WorkspaceState>,
  ) {
    ports.subscribe(() => {
      if (state.getState().phase === 'ready' && !state.getState().closing)
        this.queue?.dirty();
    });
  }
  private run(action: () => Promise<void>) {
    if (this.operation)
      return Promise.reject(
        new Error('A workspace operation is already in progress.'),
      );
    this.state.setState({ phase: 'switching', error: '' });
    const operation = action()
      .catch((error) => {
        this.state.setState({
          phase: this.state.getState().active ? 'ready' : 'error',
          error: String(error),
        });
        throw error;
      })
      .finally(() => {
        if (this.operation === operation) this.operation = undefined;
      });
    this.operation = operation;
    return operation;
  }
  async refresh() {
    const catalog = await this.ports.invoke<Catalog>('workspace_list');
    this.state.setState({
      entries: catalog.entries,
      defaultFolder: catalog.defaultFolder,
    });
    return catalog;
  }
  initialize() {
    if (this.initialized) return this.initialized;
    if (!this.ports.native) {
      this.state.setState({ phase: 'ready' });
      return Promise.resolve();
    }
    this.initialized = this.run(async () => {
      const catalog = await this.refresh();
      const id =
        catalog.entries.find((e) => e.id === catalog.lastActive)?.id ??
        catalog.entries[0]?.id;
      const loaded = id
        ? await this.ports.invoke<LoadedWorkspace>('workspace_open', { id })
        : await this.ports.invoke<LoadedWorkspace>('workspace_create', {
            id: this.ports.uuid(),
            name: 'Personal workspace',
            folder: null,
          });
      await this.apply(loaded);
      if (catalog.recovered)
        this.state.setState({
          error: 'The recent-workspace catalog was recovered from its backup.',
        });
    });
    return this.initialized;
  }
  private async apply(loaded: LoadedWorkspace) {
    const previous = this.state.getState().active;
    if (previous?.document.id === loaded.document.id) {
      this.state.setState({ phase: 'ready' });
      return;
    }
    try {
      await this.ports.closeAll();
    } catch (error) {
      await this.ports.invoke('workspace_release', { id: loaded.document.id });
      throw error;
    }
    this.queue?.dispose();
    this.queue = undefined;
    this.ports.prepare(loaded.document.nodes);
    this.ports.replace(loaded);
    this.state.setState({
      active: loaded,
      phase: 'restoring',
      recovered: loaded.recovered,
      restoreErrors: [],
      saveState: 'saved',
    });
    if (previous)
      await this.ports.invoke('workspace_release', {
        id: previous.document.id,
      });
    const errors: string[] = [];
    const terminals = loaded.document.nodes.filter(
      (n) => n.kind === 'terminal',
    );
    let index = 0;
    const worker = async () => {
      while (index < terminals.length) {
        const node = terminals[index++];
        try {
          await this.ports.start(node);
        } catch (error) {
          errors.push(`${node.title || 'Terminal'}: ${String(error)}`);
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(4, terminals.length) }, worker),
    );
    // Failure to remember the active folder must not make a successfully
    // restored layout unusable or leave it without autosave.
    let warning = '';
    try {
      await this.ports.invoke('workspace_activate', { id: loaded.document.id });
      await this.refresh();
    } catch (error) {
      warning = `Layout restored, but the recent-workspace list could not update: ${String(error)}`;
    }
    const queue = new Autosave(
      this.ports.capture,
      async (layout) => {
        const saved = await this.ports.invoke<LoadedWorkspace>(
          'workspace_save',
          { id: loaded.document.id, layout },
        );
        if (this.queue === queue)
          this.state.setState({ active: saved, recovered: false });
      },
      (saveState, error) => {
        if (this.queue === queue)
          this.state.setState({
            saveState,
            ...(error ? { error } : saveState === 'saved' ? { error: '' } : {}),
          });
      },
    );
    this.queue = queue;
    this.state.setState({
      phase: 'ready',
      restoreErrors: errors,
      error: warning,
    });
  }
  switchTo(id: string) {
    if (id === this.state.getState().active?.document.id)
      return Promise.resolve();
    return this.run(async () => {
      await this.queue?.flush();
      await this.apply(
        await this.ports.invoke<LoadedWorkspace>('workspace_open', { id }),
      );
    });
  }
  create(name: string, folder: string) {
    return this.run(async () => {
      await this.queue?.flush();
      await this.apply(
        await this.ports.invoke<LoadedWorkspace>('workspace_create', {
          id: this.ports.uuid(),
          name,
          folder: folder.trim() || null,
        }),
      );
    });
  }
  openFolder(folder: string) {
    return this.run(async () => {
      await this.queue?.flush();
      await this.apply(
        await this.ports.invoke<LoadedWorkspace>('workspace_open_folder', {
          folder: folder.trim(),
        }),
      );
    });
  }
  save() {
    return this.queue?.flush(true) ?? Promise.resolve();
  }
  async prepareToClose() {
    this.state.setState({ closing: true });
    try {
      await this.operation?.catch(() => {});
      await this.queue?.flush();
    } catch (error) {
      this.state.setState({ closing: false });
      throw error;
    }
  }
  cancelClose() {
    this.state.setState({ closing: false });
  }
}
