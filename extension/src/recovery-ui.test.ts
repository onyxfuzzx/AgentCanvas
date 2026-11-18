import { expect, test, vi, beforeEach } from 'vitest';
import type { RecoveryStore } from './recovery';
const ui = vi.hoisted(() => ({
  workspace: { isTrusted: true },
  panel: { webview: { html: '', onDidReceiveMessage: vi.fn() } },
  pick: vi.fn(),
}));
vi.mock('vscode', () => ({
  workspace: ui.workspace,
  ViewColumn: { Active: 1 },
  window: {
    createWebviewPanel: () => ui.panel,
    showQuickPick: ui.pick,
    showInformationMessage: vi.fn(),
  },
}));
import { showRecovery } from './recovery-ui';

beforeEach(() => {
  ui.workspace.isTrusted = true;
  ui.panel.webview.html = '';
  vi.clearAllMocks();
});
function fixture() {
  const store = {
    list: vi.fn(async () => [{ id: 'draft', modified: 1, bytes: 1024 }]),
    inspect: vi.fn(async () => ({
      id: 'draft',
      fingerprint: 'hash',
      saves: [
        {
          command: 'note_save',
          args: {
            workspaceId: 'workspace',
            relativePath: 'notes/id.md',
            expected: '</pre><script>baseline</script>',
            content: '<img src="https://invalid/remote" onerror="run()">',
          },
        },
      ],
    })),
    restore: vi.fn(async () => ({
      folder: 'C:\\recovered',
      name: 'Recovery copy',
      workspaceId: 'copy',
    })),
  };
  const host = { request: vi.fn(), stop: vi.fn(async () => {}) };
  return { store, host, createHost: vi.fn(() => host) };
}
test('preview escapes untrusted note and baseline text, blocks network resources and starts no backend', async () => {
  const { store, createHost } = fixture();
  await showRecovery(store as unknown as RecoveryStore, createHost, {
    id: 'draft',
    workspaceId: 'workspace',
  });
  expect(ui.panel.webview.html).toContain('&lt;img src=');
  expect(ui.panel.webview.html).toContain('&lt;/pre&gt;&lt;script&gt;baseline');
  expect(ui.panel.webview.html).not.toContain('<img');
  expect(ui.panel.webview.html).toContain("default-src 'none'");
  expect(createHost).not.toHaveBeenCalled();
  expect(ui.pick).not.toHaveBeenCalled();
});
test('restore rechecks trust and only creates and stops a backend after an explicit restore action', async () => {
  const { store, host, createHost } = fixture();
  await showRecovery(store as unknown as RecoveryStore, createHost, {
    id: 'draft',
    workspaceId: 'workspace',
  });
  const receive = ui.panel.webview.onDidReceiveMessage.mock.calls[0][0];
  await receive({ action: 'terminal_spawn' });
  expect(createHost).not.toHaveBeenCalled();
  ui.workspace.isTrusted = false;
  await receive({ action: 'restore' });
  expect(createHost).not.toHaveBeenCalled();
  expect(ui.panel.webview.html).toContain('Trust this workspace');
  ui.workspace.isTrusted = true;
  await receive({ action: 'restore' });
  expect(store.restore).toHaveBeenCalledOnce();
  expect(host.stop).toHaveBeenCalledOnce();
  expect(ui.panel.webview.html).toContain('Recovery copy saved');
  await receive({ action: 'restore-notes' });
  expect(store.restore).toHaveBeenLastCalledWith(
    expect.anything(),
    'workspace',
    host,
    true,
  );
});
test('missing files or workspaces do not open a different recovery file', async () => {
  const { store, createHost } = fixture();
  await expect(
    showRecovery(store as unknown as RecoveryStore, createHost, {
      id: '../outside',
      workspaceId: 'workspace',
    }),
  ).rejects.toThrow('not found');
  await expect(
    showRecovery(store as unknown as RecoveryStore, createHost, {
      id: 'draft',
      workspaceId: 'another',
    }),
  ).rejects.toThrow('Workspace was not found');
  expect(createHost).not.toHaveBeenCalled();
});
