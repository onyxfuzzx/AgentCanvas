// Executed by the installed editor's extension test runner, never packaged.
const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const product = require('../product.json');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
    const catalog = JSON.parse(
      await fs.readFile(path.join(storage, 'workspaces.json'), 'utf8'),
    );
    const entry = catalog.entries[0];
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
