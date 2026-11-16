import * as vscode from 'vscode';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { NativeHost } from './host';
import { Checkpoints } from './checkpoints';
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

declare const PRODUCT_NAME: string;
let session: CanvasSession | undefined;
let closing: Promise<void> = Promise.resolve();
let output: vscode.OutputChannel;

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
  private host: NativeHost;
  private checkpoints = new Checkpoints();
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
  ) {
    this.host = new NativeHost(
      join(context.extensionPath, 'native', 'agentcanvas-editor.exe'),
      context.globalStorageUri.fsPath,
      homedir(),
      (message) => output.appendLine(message),
    );
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
      closing = this.stop();
      void closing.catch((error) =>
        vscode.window.showErrorMessage(`${PRODUCT_NAME}: ${String(error)}`),
      );
    });
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
    );
  }
  private async receive(message: unknown) {
    if (!this.accepting || !record(message)) return;
    if (message.type === 'agentcanvas:ready') {
      this.readyResolve();
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
      this.checkpoints.update(message.command, message.args);
      return;
    }
    if (message.type !== 'agentcanvas:invoke' || !validId(message.id)) return;
    const reply: Record<string, unknown> = {
      type: 'agentcanvas:reply',
      id: message.id,
    };
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
        if (provider !== 'codex' && provider !== 'claude')
          throw new Error('Choose Codex or Claude Code.');
        const selected = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: { 'Native executable': ['exe'] },
          title: `Choose ${provider}.exe`,
          openLabel: 'Use executable',
        });
        if (selected?.[0] && selected[0].scheme !== 'file')
          throw new Error('Choose a local Windows executable.');
        reply.result = selected?.[0]?.fsPath ?? null;
      } else {
        if (!nativeCommands.has(message.command))
          throw new Error('Unsupported editor command.');
        reply.result = await this.host.request(message.command, message.args);
        if (
          message.command === 'workspace_save' ||
          message.command === 'note_save'
        )
          this.checkpoints.saved(message.command, message.args);
      }
    } catch (error) {
      reply.error = String(error);
    }
    if (message.command === 'note_read' && !reply.error && record(message.args))
      this.checkpoints.baseline(message.args, reply.result);
    await this.panel.webview.postMessage(reply);
    if (dispose) this.panel.dispose();
  }
  async save(): Promise<void> {
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
      void this.panel.webview.postMessage({ type: 'agentcanvas:save', id });
    });
  }
  close() {
    return this.panel.webview.postMessage({ type: 'agentcanvas:close' });
  }
  async showSetup() {
    await bounded(this.ready, 'Wait for the canvas to finish loading.', 30000);
    await this.panel.webview.postMessage({ type: 'agentcanvas:setup' });
  }
  async openFile(args: unknown) {
    if (!vscode.workspace.isTrusted || !this.accepting)
      throw new Error(
        'Open a trusted canvas workspace before opening reviewed files.',
      );
    await openReviewedFile(args, {
      request: (command, values) => this.host.request(command, values),
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
    this.shutdown = (async () => {
      for (const save of this.saves.values()) {
        clearTimeout(save.timer);
        save.reject(new Error('Canvas closed.'));
      }
      this.saves.clear();
      try {
        await bounded(
          this.host.request('editor_quiesce'),
          'Backend shutdown is still pending.',
        );
        await bounded(
          Promise.allSettled([...this.calls]),
          'Backend requests did not settle before closing.',
        );
        await bounded(this.host.drain(), 'Backend requests are still running.');
        await this.checkpoints.flush((command, args) =>
          this.host.request(command, args),
        );
      } catch (error) {
        // Preserve immutable durable drafts if a conflict prevents the final flush.
        const folder = join(this.context.globalStorageUri.fsPath, 'recovery');
        await mkdir(folder, { recursive: true });
        const path = join(folder, `drafts-${randomUUID()}.json`);
        const temporary = `${path}.tmp`;
        await writeFile(
          temporary,
          JSON.stringify({ version: 1, saves: this.checkpoints.snapshot() }),
          { encoding: 'utf8', flag: 'wx', mode: 0o600 },
        );
        await rename(temporary, path);
        throw new Error(
          `Save failed: ${String(error)}. Pending layout and note drafts were preserved at ${path}`,
        );
      } finally {
        await this.host.stop();
      }
    })();
    return this.shutdown;
  }
}

export function activate(context: vscode.ExtensionContext) {
  output = vscode.window.createOutputChannel(PRODUCT_NAME);
  const setup = new SetupPreferences(context.globalState);
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
    await closing.catch(() => {});
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
  if (session) await session.stop();
  await closing.catch(() => {});
}
