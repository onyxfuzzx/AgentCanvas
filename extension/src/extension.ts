import * as vscode from 'vscode';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { NativeHost } from './host';
import { Backend } from './backend';
import {
  externalUrl,
  frame,
  nativeCommands,
  record,
  validId,
} from './protocol';
import { webviewHtml } from './webview';
import { EditorProjects } from './projects';
import { openReviewedFile } from './review-files';
import { SetupPreferences } from './setup';
import { RecoveryStore } from './recovery';
import { showRecovery } from './recovery-ui';
import {
  isAgentProvider,
  providerExecutables,
} from '../../src/agents/providers';

declare const PRODUCT_NAME: string;
let session: CanvasSession | undefined;
let closing: Promise<void> = Promise.resolve();
let output: vscode.OutputChannel;
const recoveryHosts = new Set<NativeHost>();

async function bounded<T>(
  operation: Promise<T>,
  message: string,
  timeout = 10000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

class CanvasSession {
  private backend: Backend;
  private rendererGeneration = 1;
  private rendererReady = false;
  private backendStopped = false;
  private capture?: {
    id: number;
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  private accepting = true;
  private calls = new Set<Promise<void>>();
  private saves = new Map<
    number,
    {
      resolve: () => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private sequence = 0;
  private readyResolve!: () => void;
  private ready = new Promise<void>((resolve) => {
    this.readyResolve = resolve;
  });
  private shutdown?: Promise<void>;
  constructor(
    private context: vscode.ExtensionContext,
    readonly panel: vscode.WebviewPanel,
    private projects: EditorProjects,
    private setup: SetupPreferences,
    private recovery: RecoveryStore,
  ) {
    this.backend = new Backend({
      create: (failed) =>
        new NativeHost(
          join(context.extensionPath, 'native', 'agentcanvas-editor.exe'),
          context.globalStorageUri.fsPath,
          homedir(),
          (message) => output.appendLine(message),
          failed,
        ),
      trusted: () => vscode.workspace.isTrusted,
      preserve: (saves) => this.recovery.preserve(saves),
      capture: () => this.captureDrafts(),
      changed: (state) => {
        if (!this.accepting) return;
        if (state.phase !== 'connected')
          this.rejectSaves(
            'Backend unavailable; pending save handshake cancelled.',
          );
        // A tab may be disposed between a process event and its notification.
        // Losing this view must never prevent native process cleanup.
        try {
          void this.panel.webview
            .postMessage({
              type: 'agentcanvas:backend',
              generation: this.rendererGeneration,
              state,
            })
            .then(undefined, () => {});
        } catch {
          /* The disposed tab no longer needs status updates. */
        }
      },
      reload: (generation) => this.render(generation, true),
    });
    panel.iconPath = vscode.Uri.joinPath(
      context.extensionUri,
      'media',
      'canvas.svg',
    );
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, 'webview'),
      ],
    };
    panel.webview.onDidReceiveMessage((message: unknown) => {
      const call = this.receive(message)
        .catch((error) => {
          void vscode.window.showErrorMessage(
            `${PRODUCT_NAME}: ${String(error)}`,
          );
        })
        .finally(() => this.calls.delete(call));
      this.calls.add(call);
    });
    panel.onDidDispose(() => {
      if (session === this) session = undefined;
      closing = this.stop().catch((error) => {
        void vscode.window.showErrorMessage(
          `${PRODUCT_NAME}: ${String(error)}`,
        );
        if (!this.backendStopped) throw error;
      });
      void closing.catch(() => {});
    });
    this.render(1, false);
    void this.backend.start().catch(() => {});
  }
  private render(generation: number, paused: boolean) {
    this.readyResolve();
    this.rendererGeneration = generation;
    this.rendererReady = false;
    this.ready = new Promise<void>((resolve) => {
      this.readyResolve = resolve;
    });
    const panel = this.panel,
      context = this.context;
    panel.webview.html = webviewHtml(
      panel.webview
        .asWebviewUri(
          vscode.Uri.joinPath(context.extensionUri, 'webview', 'canvas.js'),
        )
        .toString(),
      panel.webview
        .asWebviewUri(
          vscode.Uri.joinPath(context.extensionUri, 'webview', 'canvas.css'),
        )
        .toString(),
      panel.webview.cspSource,
      PRODUCT_NAME,
      generation,
      paused,
    );
  }
  private captureDrafts(): Promise<void> {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.capture = undefined;
        reject(
          new Error(
            'Canvas could not checkpoint its latest edits. Restart refused; close the tab to preserve the last received drafts.',
          ),
        );
      }, 5000);
      this.capture = { id, resolve, reject, timer };
      void this.panel.webview.postMessage({
        type: 'agentcanvas:capture',
        id,
        generation: this.rendererGeneration,
      });
    });
  }
  async restart() {
    await this.backend.restart();
    await bounded(
      this.ready,
      'The backend connected, but its canvas did not finish restoring.',
      30000,
    );
    if (!this.accepting) throw new Error('Canvas closed during restart.');
  }
  private rejectSaves(message: string) {
    for (const save of this.saves.values()) {
      clearTimeout(save.timer);
      save.reject(new Error(message));
    }
    this.saves.clear();
  }
  status() {
    return { ...this.backend.state, pid: this.backend.pid };
  }
  private async receive(message: unknown) {
    if (!this.accepting || !record(message)) return;
    if (message.generation !== this.rendererGeneration) return;
    if (message.type === 'agentcanvas:ready') {
      if (this.rendererReady) {
        await this.restart();
        return;
      }
      this.rendererReady = true;
      await this.panel.webview.postMessage({
        type: 'agentcanvas:backend',
        generation: this.rendererGeneration,
        state: this.backend.state,
      });
      return;
    }
    if (message.type === 'agentcanvas:workspaceReady') {
      this.readyResolve();
      return;
    }
    if (message.type === 'agentcanvas:captured') {
      if (this.capture && this.capture.id === message.id) {
        clearTimeout(this.capture.timer);
        if (typeof message.error === 'string')
          this.capture.reject(new Error(message.error));
        else this.capture.resolve();
        this.capture = undefined;
      }
      return;
    }
    if (message.type === 'agentcanvas:restart') {
      await this.restart();
      return;
    }
    if (message.type === 'agentcanvas:dispose') {
      this.panel.dispose();
      return;
    }
    if (message.type === 'agentcanvas:saved' && validId(message.id)) {
      const save = this.saves.get(message.id);
      if (save) {
        clearTimeout(save.timer);
        this.saves.delete(message.id);
        if (typeof message.error === 'string')
          save.reject(new Error(message.error));
        else save.resolve();
      }
      return;
    }
    if (message.type === 'agentcanvas:checkpoint') {
      this.backend.checkpoint(message.command, message.args);
      return;
    }
    if (message.type !== 'agentcanvas:invoke' || !validId(message.id)) return;
    const reply: Record<string, unknown> = {
      type: 'agentcanvas:reply',
      id: message.id,
      generation: this.rendererGeneration,
    };
    const generation = this.backend.state.generation;
    let dispose = false;
    try {
      frame(message);
      if (!vscode.workspace.isTrusted)
        throw new Error('Trust this workspace before using the canvas.');
      if (typeof message.command !== 'string' || !record(message.args))
        throw new Error('Invalid canvas request.');
      if (message.command === 'editor_dispose') {
        dispose = true;
        reply.result = null;
      } else if (message.command === 'editor_open_external') {
        const url = externalUrl(message.args.url);
        if (!(await vscode.env.openExternal(vscode.Uri.parse(url))))
          throw new Error('The browser could not open this address.');
        reply.result = null;
      } else if (message.command === 'editor_project_context') {
        reply.result = this.projects.context();
      } else if (message.command === 'editor_select_project') {
        reply.result = this.projects.select(message.args.path);
      } else if (message.command === 'editor_pick_directory') {
        reply.result = await this.projects.browse(message.args.cwd);
      } else if (message.command === 'editor_open_review_file') {
        await this.openFile(message.args);
        reply.result = null;
      } else if (message.command === 'editor_setup_get') {
        reply.result = this.setup.get();
      } else if (message.command === 'editor_setup_complete') {
        reply.result = await this.setup.complete();
      } else if (message.command === 'editor_pick_executable') {
        const provider = message.args.provider;
        if (!isAgentProvider(provider))
          throw new Error('Choose Codex, Antigravity or Claude Code.');
        const selected = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: { 'Native executable': ['exe'] },
          title: `Choose ${providerExecutables[provider]}`,
          openLabel: 'Use executable',
        });
        if (selected?.[0] && selected[0].scheme !== 'file')
          throw new Error('Choose a local Windows executable.');
        reply.result = selected?.[0]?.fsPath ?? null;
      } else {
        if (!nativeCommands.has(message.command))
          throw new Error('Unsupported editor command.');
        reply.result = await this.backend.request(
          message.command,
          message.args,
        );
      }
    } catch (error) {
      reply.error = String(error);
    }
    if (
      generation !== this.backend.state.generation ||
      message.generation !== this.rendererGeneration ||
      !this.accepting
    )
      return;
    await this.panel.webview.postMessage(reply);
    if (dispose) this.panel.dispose();
  }
  async save(): Promise<void> {
    const generation = this.rendererGeneration;
    let readyTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.ready,
        new Promise<never>((_, reject) => {
          readyTimer = setTimeout(
            () =>
              reject(new Error('The canvas renderer did not become ready.')),
            30000,
          );
        }),
      ]);
    } finally {
      clearTimeout(readyTimer);
    }
    if (!this.accepting || generation !== this.rendererGeneration)
      throw new Error('Canvas closed or renderer replaced before saving.');
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.saves.delete(id);
        reject(
          new Error(
            'Save is still pending. Check canvas errors before closing.',
          ),
        );
      }, 30_000);
      this.saves.set(id, { resolve, reject, timer });
      void this.panel.webview.postMessage({
        type: 'agentcanvas:save',
        id,
        generation: this.rendererGeneration,
      });
    });
  }
  close() {
    if (this.backend.state.phase !== 'connected') {
      this.panel.dispose();
      return Promise.resolve(true);
    }
    return this.panel.webview.postMessage({
      type: 'agentcanvas:close',
      generation: this.rendererGeneration,
    });
  }
  async showSetup() {
    await bounded(this.ready, 'Wait for the canvas to finish loading.', 30000);
    await this.panel.webview.postMessage({
      type: 'agentcanvas:setup',
      generation: this.rendererGeneration,
    });
  }
  async openFile(args: unknown) {
    if (!vscode.workspace.isTrusted || !this.accepting)
      throw new Error(
        'Open a trusted canvas workspace before opening reviewed files.',
      );
    await openReviewedFile(args, {
      request: (command, values) => this.backend.request(command, values),
      open: async (path, line) => {
        const document = await vscode.workspace.openTextDocument(
          vscode.Uri.file(path),
        );
        const selectedLine = Math.min(
          line - 1,
          Math.max(0, document.lineCount - 1),
        );
        await vscode.window.showTextDocument(document, {
          preview: true,
          selection: new vscode.Range(selectedLine, 0, selectedLine, 0),
        });
      },
    });
  }
  stop(): Promise<void> {
    if (this.shutdown) return this.shutdown;
    this.accepting = false;
    this.readyResolve();
    if (this.capture) {
      clearTimeout(this.capture.timer);
      this.capture.reject(new Error('Canvas closed during restart.'));
      this.capture = undefined;
    }
    this.shutdown = (async () => {
      for (const save of this.saves.values()) {
        clearTimeout(save.timer);
        save.reject(new Error('Canvas closed.'));
      }
      this.saves.clear();
      try {
        if (this.backend.state.phase !== 'connected') return;
        await bounded(
          this.backend.request('editor_quiesce'),
          'Backend shutdown is still pending.',
        );
        await bounded(
          Promise.allSettled([...this.calls]),
          'Backend requests did not settle before closing.',
        );
        await this.backend.flush();
      } catch (error) {
        // Preserve immutable durable drafts if a conflict prevents the final flush.
        const path = await this.recovery.preserve(
          this.backend.checkpoints.snapshot(),
        );
        throw new Error(
          `Save failed: ${String(error)}. Pending layout and note drafts were preserved at ${path}. Run ${PRODUCT_NAME}: Recover Canvas Drafts to inspect and restore a copy.`,
        );
      } finally {
        await this.backend.stop();
        this.backendStopped = true;
      }
    })();
    return this.shutdown;
  }
}

export function activate(context: vscode.ExtensionContext) {
  output = vscode.window.createOutputChannel(PRODUCT_NAME);
  const setup = new SetupPreferences(context.globalState);
  const recovery = new RecoveryStore(context.globalStorageUri.fsPath);
  const projects = new EditorProjects({
    folders: () =>
      (vscode.workspace.workspaceFolders ?? [])
        .filter((folder) => folder.uri.scheme === 'file')
        .map((folder) => ({ name: folder.name, path: folder.uri.fsPath })),
    activeFolder: () => {
      const uri = vscode.window.activeTextEditor?.document.uri;
      const folder =
        uri?.scheme === 'file'
          ? vscode.workspace.getWorkspaceFolder(uri)
          : undefined;
      return folder?.uri.scheme === 'file' ? folder.uri.fsPath : undefined;
    },
    pickDirectory: async (initial) => {
      let defaultUri = initial ? vscode.Uri.file(initial) : undefined;
      if (defaultUri) {
        try {
          if (
            !(
              (await vscode.workspace.fs.stat(defaultUri)).type &
              vscode.FileType.Directory
            )
          )
            defaultUri = undefined;
        } catch {
          defaultUri = undefined;
        }
      }
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Use folder',
        title: 'Choose terminal working directory',
        defaultUri,
      });
      if (!picked?.length) return null;
      if (picked[0].scheme !== 'file')
        throw new Error('Choose a local filesystem folder.');
      return picked[0].fsPath;
    },
  });
  const open = async (panel?: vscode.WebviewPanel) => {
    if (!vscode.workspace.isTrusted)
      throw new Error('Open a trusted workspace to start the canvas.');
    if (
      process.platform !== 'win32' ||
      process.arch !== 'x64' ||
      vscode.env.remoteName
    )
      throw new Error('This build requires a local Windows x64 editor window.');
    await closing;
    projects.captureActiveFolder();
    await mkdir(context.globalStorageUri.fsPath, { recursive: true });
    if (session) {
      session.panel.reveal();
      panel?.dispose();
      return;
    }
    session = new CanvasSession(
      context,
      panel ??
        vscode.window.createWebviewPanel(
          'agentcanvas.canvas',
          PRODUCT_NAME,
          vscode.ViewColumn.Active,
          { enableScripts: true, retainContextWhenHidden: true },
        ),
      projects,
      setup,
      recovery,
    );
  };
  const report = (action: () => Promise<unknown>) => async () => {
    try {
      return await action();
    } catch (error) {
      void vscode.window.showErrorMessage(`${PRODUCT_NAME}: ${String(error)}`);
      throw error;
    }
  };
  context.subscriptions.push(
    output,
    vscode.commands.registerCommand(
      'agentcanvas.open',
      report(() => open()),
    ),
    vscode.commands.registerCommand(
      'agentcanvas.recover',
      (selection?: unknown) =>
        report(() =>
          showRecovery(
            recovery,
            () => {
              const host = new NativeHost(
                join(context.extensionPath, 'native', 'agentcanvas-editor.exe'),
                context.globalStorageUri.fsPath,
                homedir(),
                (message) => output.appendLine(message),
              );
              recoveryHosts.add(host);
              return {
                request: (command, args) => host.request(command, args),
                stop: async () => {
                  try {
                    await host.stop();
                  } finally {
                    recoveryHosts.delete(host);
                  }
                },
              };
            },
            selection,
          ),
        )(),
    ),
    vscode.commands.registerCommand(
      'agentcanvas.save',
      report(async () => {
        if (session) await session.save();
        else await open();
      }),
    ),
    vscode.commands.registerCommand(
      'agentcanvas.close',
      report(async () => {
        await session?.close();
      }),
    ),
    vscode.commands.registerCommand(
      'agentcanvas.restartBackend',
      report(async () => {
        if (!session)
          throw new Error('Open the canvas before restarting its backend.');
        await session.restart();
      }),
    ),
    vscode.commands.registerCommand('agentcanvas.backendStatus', () =>
      session?.status(),
    ),
    vscode.window.registerTreeDataProvider('agentcanvas.launcher', {
      getTreeItem: (item: vscode.TreeItem) => item,
      getChildren: () => [],
    }),
    vscode.commands.registerCommand('agentcanvas.projectContext', () =>
      projects.context(),
    ),
    vscode.commands.registerCommand('agentcanvas.setupStatus', () =>
      setup.get(),
    ),
    vscode.commands.registerCommand(
      'agentcanvas.setup',
      report(async () => {
        await open();
        await session?.showSetup();
      }),
    ),
    vscode.commands.registerCommand(
      'agentcanvas.selectProject',
      (path?: unknown) =>
        report(async () => {
          if (!vscode.workspace.isTrusted)
            throw new Error(
              'Trust this editor workspace before choosing a project.',
            );
          if (path !== undefined) return projects.select(path);
          const selected = await vscode.window.showWorkspaceFolderPick({
            placeHolder:
              'Choose the project folder for new terminals and agents',
          });
          if (selected?.uri.scheme === 'file')
            return projects.select(selected.uri.fsPath);
          return null;
        })(),
    ),
    vscode.commands.registerCommand(
      'agentcanvas.openReviewedFile',
      async (args: unknown) => {
        if (!session)
          throw new Error('Open the canvas before opening a reviewed file.');
        await session.openFile(args);
      },
    ),
    vscode.window.registerWebviewPanelSerializer('agentcanvas.canvas', {
      deserializeWebviewPanel: async (panel) => {
        try {
          await open(panel);
        } catch (error) {
          panel.dispose();
          throw error;
        }
      },
    }),
  );
}
export async function deactivate() {
  await Promise.all([...recoveryHosts].map((host) => host.stop()));
  if (session) await session.stop();
  await closing.catch(() => {});
}
