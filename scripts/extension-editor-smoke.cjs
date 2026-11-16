// Executed by the installed editor's extension test runner, never packaged.
const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const product = require('../product.json');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { homedir } = require('node:os');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function projectFixture(extension, storage) {
  await fs.mkdir(storage, { recursive: true });
  const { NativeHost } = require(process.env.AGENTCANVAS_SMOKE_SUPPORT);
  const folder = path.join(
    path.dirname(storage),
    `project-smoke-${randomUUID()}`,
  );
  const repo = path.join(folder, 'repository 世界');
  const hooks = path.join(folder, 'empty-hooks');
  await fs.mkdir(repo, { recursive: true });
  await fs.mkdir(hooks);
  const git = (args) =>
    execFileSync(
      'git',
      [
        '-c',
        `core.hooksPath=${hooks}`,
        '-c',
        `init.templateDir=${hooks}`,
        '-c',
        'user.name=Canvas smoke',
        '-c',
        'user.email=canvas-smoke@example.invalid',
        ...args,
      ],
      { cwd: repo, windowsHide: true, shell: false, stdio: 'pipe' },
    );
  git(['init', '-b', 'main']);
  const relative = 'review 世界.txt';
  await fs.writeFile(path.join(repo, relative), 'first\noriginal\n');
  git(['add', '--', relative]);
  git(['commit', '-m', 'Fixture base']);
  const base = git(['rev-parse', 'HEAD']).toString('utf8').trim();
  const host = new NativeHost(
    path.join(extension.extensionPath, 'native/agentcanvas-editor.exe'),
    storage,
    homedir(),
    () => {},
  );
  try {
    const workspaceId = randomUUID(),
      id = randomUUID();
    const loaded = await host.request('workspace_create', {
      id: workspaceId,
      name: 'Project integration smoke',
      folder: path.join(
        path.dirname(process.env.AGENTCANVAS_SMOKE_SUPPORT),
        'workspaces',
        workspaceId,
      ),
    });
    await host.request('workspace_activate', { id: workspaceId });
    const cliFolder = path.join(folder, 'native CLI fixture');
    await fs.mkdir(cliFolder);
    const executable = path.join(cliFolder, 'codex.exe');
    await fs.writeFile(
      executable,
      'Detection-only fixture. Never execute this file.',
    );
    const inspection = await host.request('agent_inspect', {
      provider: 'codex',
      executable,
    });
    assert(inspection.available, 'Native setup detects an existing file');
    assert.equal(
      inspection.capabilities.version,
      'unknown; executable detection only',
    );
    assert.equal(
      (
        await host.request('agent_inspect', {
          provider: 'codex',
          executable: path.join(cliFolder, 'codex.cmd'),
        })
      ).available,
      false,
    );
    assert.equal(
      (
        await host.request('agent_inspect', {
          provider: 'codex',
          executable: path.join(cliFolder, 'missing/codex.exe'),
        })
      ).available,
      false,
    );
    const { AgentSetup, initialProviders } = require(
      path.join(
        path.dirname(process.env.AGENTCANVAS_SMOKE_SUPPORT),
        'setup.cjs',
      ),
    );
    let completed = false;
    const setup = new AgentSetup(
      (command, args) => host.request(command, args),
      randomUUID,
      async () => {
        const { nodes, viewport, settings, edges } = loaded.document;
        await host.request('workspace_save', {
          id: workspaceId,
          layout: { nodes, viewport, settings, edges },
        });
      },
      async () => {
        completed = true;
      },
    );
    const data = await setup.load();
    const configs = initialProviders(data.reply, randomUUID);
    configs[0] = {
      ...configs[0],
      enabled: true,
      executable,
      name: 'Setup fixture preset',
    };
    await setup.finish(configs);
    assert(
      completed,
      'Setup completes only after native preset save and workspace flush',
    );
    const saved = await host.request('agent_catalog');
    assert.equal(
      saved.library.profiles.find(
        (profile) => profile.id === configs[0].profileId,
      ).executable,
      executable,
    );
    const catalog = await host.request('area_action', {
      workspaceId,
      action: {
        type: 'create',
        id,
        name: 'Reviewed area',
        repository: repo,
        base,
      },
    });
    const area = catalog.areas.find((area) => area.id === id);
    assert(area, 'Managed checkout created');
    const file = path.join(area.directory, relative);
    await fs.writeFile(file, 'first\nchanged in managed checkout\n');
    const review = await host.request('area_review', { workspaceId, id });
    assert(
      review.diff.includes('changed in managed checkout'),
      'File is part of the review diff',
    );
    return { workspaceId, id, relative, file };
  } finally {
    await host.stop();
  }
}
exports.run = async function () {
  const result = process.env.AGENTCANVAS_SMOKE_RESULT;
  const storage = process.env.AGENTCANVAS_SMOKE_STORAGE;
  try {
    assert(
      result && storage,
      'Smoke result and isolated storage paths are required',
    );
    const extension = vscode.extensions.getExtension(
      'agentcanvas-local.agentcanvas',
    );
    assert(extension, 'Extension was discovered');
    await extension.activate();
    let fixture;
    const projectChecks = [];
    if (process.env.AGENTCANVAS_SMOKE_SUPPORT) {
      const roots = vscode.workspace.workspaceFolders;
      assert(roots?.length >= 2, 'Multi-root editor fixture is required');
      const context = await vscode.commands.executeCommand(
        'agentcanvas.projectContext',
      );
      assert.deepEqual(
        context.folders.map((folder) => folder.path),
        roots.map((folder) => folder.uri.fsPath),
      );
      const activeFile = vscode.Uri.joinPath(
        roots[1].uri,
        `active-${randomUUID()}.txt`,
      );
      await vscode.workspace.fs.writeFile(
        activeFile,
        Buffer.from('Active project fixture\n'),
      );
      await vscode.window.showTextDocument(activeFile);
      assert.equal(
        (await vscode.commands.executeCommand('agentcanvas.projectContext'))
          .defaultCwd,
        roots[1].uri.fsPath,
      );
      const selected = await vscode.commands.executeCommand(
        'agentcanvas.selectProject',
        roots[0].uri.fsPath,
      );
      assert.equal(selected.defaultCwd, roots[0].uri.fsPath);
      await assert.rejects(
        vscode.commands.executeCommand(
          'agentcanvas.selectProject',
          path.join(roots[0].uri.fsPath, 'not-an-open-root'),
        ),
      );
      fixture = await projectFixture(extension, storage);
      projectChecks.push(
        'multi-root folder context',
        'active editor project default',
        'explicit project selection',
        'reject unknown project folder',
      );
    }
    await vscode.commands.executeCommand('agentcanvas.open');
    const deadline = Date.now() + 30000;
    let saved = false,
      lastError;
    while (!saved && Date.now() < deadline) {
      try {
        await vscode.commands.executeCommand('agentcanvas.save');
        saved = true;
      } catch (error) {
        lastError = String(error);
        await delay(500);
      }
    }
    assert(saved, `Webview save handshake failed: ${lastError}`);
    const beforeSetup = await vscode.commands.executeCommand(
      'agentcanvas.setupStatus',
    );
    assert.deepEqual(beforeSetup, { version: 1, completed: false });
    await vscode.commands.executeCommand('agentcanvas.setup');
    assert.deepEqual(
      await vscode.commands.executeCommand('agentcanvas.setupStatus'),
      beforeSetup,
      'Opening setup cannot silently mark it complete',
    );
    projectChecks.push(
      'first-run preference starts incomplete',
      'setup command opens renderer',
      'opening setup leaves completion explicit',
    );
    if (fixture)
      projectChecks.push(
        'native CLI inspection rejects missing paths and wrappers',
        'setup controller saves a selected preset and flushes the workspace without executing it',
      );
    const catalog = JSON.parse(
      await fs.readFile(path.join(storage, 'workspaces.json'), 'utf8'),
    );
    const entry =
      catalog.entries.find((entry) => entry.id === catalog.lastActive) ??
      catalog.entries[0];
    assert(entry, 'Renderer initialized a native workspace');
    const workspace = JSON.parse(
      await fs.readFile(path.join(entry.folder, 'workspace.json'), 'utf8'),
    );
    assert.equal(workspace.version, 1);
    assert(
      workspace.revision > 0,
      'Save reached the native atomic persistence layer',
    );
    assert(
      vscode.window.tabGroups.all.some((group) =>
        group.tabs.some((tab) => tab.label === product.name),
      ),
      'Canvas editor tab is visible',
    );
    if (fixture) {
      assert.equal(
        workspace.id,
        fixture.workspaceId,
        'Canvas loaded the prepared task area',
      );
      await vscode.commands.executeCommand('agentcanvas.openReviewedFile', {
        workspaceId: fixture.workspaceId,
        id: fixture.id,
        relative: fixture.relative,
        line: 2,
      });
      const editor = vscode.window.activeTextEditor;
      assert.equal(
        editor.document.uri.fsPath.toLowerCase(),
        fixture.file.toLowerCase(),
      );
      assert.equal(
        editor.document.lineAt(1).text,
        'changed in managed checkout',
      );
      assert.equal(editor.selection.active.line, 1);
      await assert.rejects(
        vscode.commands.executeCommand('agentcanvas.openReviewedFile', {
          workspaceId: fixture.workspaceId,
          id: fixture.id,
          relative: '../outside.txt',
        }),
      );
      assert.equal(
        vscode.window.activeTextEditor.document.uri.fsPath.toLowerCase(),
        fixture.file.toLowerCase(),
      );
      await vscode.commands.executeCommand('agentcanvas.open');
      projectChecks.push(
        'native validated reviewed file opens in editor',
        'review line selection',
        'review traversal refusal',
      );
    }
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await delay(1500);
    await vscode.commands.executeCommand('agentcanvas.open');
    await delay(1000);
    await vscode.commands.executeCommand('agentcanvas.save');
    await vscode.commands.executeCommand('agentcanvas.close');
    await delay(1500);
    await fs.writeFile(
      result,
      JSON.stringify(
        {
          ok: true,
          editor: vscode.env.appName,
          vscodeVersion: vscode.version,
          workspaceId: workspace.id,
          checks: [
            ...projectChecks,
            'activation',
            'canvas tab',
            'React-to-host save handshake',
            'native workspace initialization',
            'atomic save',
            'tab disposal',
            'reopen and save',
            'frontend close handshake',
          ],
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (result)
      await fs.writeFile(
        result,
        JSON.stringify(
          { ok: false, error: String(error), stack: error.stack },
          null,
          2,
        ),
      );
    throw error;
  }
};
