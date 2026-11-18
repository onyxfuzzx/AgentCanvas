import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { record } from './protocol';
import { RecoveryStore, workspaceSaves, type RecoveryPort } from './recovery';

const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  );

/** Native file/workspace pickers lead to a text-only, offline draft preview. */
export async function showRecovery(
  store: RecoveryStore,
  createHost: () => RecoveryPort & { stop: () => Promise<void> },
  selection?: unknown,
) {
  if (!vscode.workspace.isTrusted)
    throw new Error('Trust this workspace before inspecting saved drafts.');
  const files = await store.list();
  if (!files.length) {
    void vscode.window.showInformationMessage(
      'No preserved canvas drafts were found.',
    );
    return;
  }
  if (
    selection !== undefined &&
    (!record(selection) ||
      typeof selection.id !== 'string' ||
      typeof selection.workspaceId !== 'string')
  )
    throw new Error('Choose a recovery file and workspace.');
  const items = files.map((entry) => ({
    label: new Date(entry.modified).toLocaleString(),
    description: `${Math.ceil(entry.bytes / 1024)} KiB`,
    detail: entry.id,
    entry,
  }));
  const file =
    selection && record(selection)
      ? items.find((item) => item.entry.id === selection.id)
      : await vscode.window.showQuickPick(items, {
          title: 'Recover Canvas Drafts',
          placeHolder: 'Choose a preserved draft file to inspect',
        });
  if (selection !== undefined && !file)
    throw new Error('Recovery file was not found.');
  if (!file) return;
  const draft = await store.inspect(file.entry.id);
  const ids = [
    ...new Set(
      draft.saves.map((save) =>
        save.command === 'workspace_save'
          ? save.args.id
          : save.args.workspaceId,
      ),
    ),
  ];
  const choices = ids.map((id) => ({
    label: `Workspace ${id}`,
    description: `${workspaceSaves(draft, id).length} preserved drafts`,
    id,
  }));
  const choice =
    selection && record(selection)
      ? choices.find((item) => item.id === selection.workspaceId)
      : choices.length === 1
        ? choices[0]
        : await vscode.window.showQuickPick(choices, {
            title: 'Recover Canvas Drafts',
            placeHolder: 'Choose the workspace to inspect',
          });
  if (!choice) {
    if (selection !== undefined)
      throw new Error('Workspace was not found in this recovery file.');
    if (!ids.length)
      void vscode.window.showInformationMessage(
        'This recovery file has no pending drafts. Its original has been kept.',
      );
    return;
  }
  const saves = workspaceSaves(draft, choice.id);
  const layout = saves.find((save) => save.command === 'workspace_save')?.args
    .layout;
  const notes = saves.filter((save) => save.command === 'note_save');
  const panel = vscode.window.createWebviewPanel(
    'agentcanvas.recovery',
    'Recover Canvas Drafts',
    vscode.ViewColumn.Active,
    { enableScripts: true, localResourceRoots: [] },
  );
  let selected = 0;
  let busy = false;
  let status = '';
  let error = false;
  const render = () => {
    const nonce = randomBytes(24).toString('base64');
    const note = notes[selected];
    const pendingPaths = new Set(notes.map((save) => save.args.relativePath));
    const savedNotes =
      layout?.nodes.filter(
        (node) => node.kind === 'note' && !pendingPaths.has(node.relativePath!),
      ).length ?? 0;
    panel.webview.html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none';"><title>Recover Canvas Drafts</title><style nonce="${nonce}">
      body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:24px;max-width:1000px;margin:auto;line-height:1.5}button,select{font:inherit;padding:8px 12px;margin:4px 8px 4px 0}button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:1px solid var(--vscode-button-border,transparent);cursor:pointer}button:disabled{opacity:.6;cursor:wait}select{color:var(--vscode-dropdown-foreground);background:var(--vscode-dropdown-background);max-width:100%}button:focus-visible,select:focus-visible{outline:2px solid var(--vscode-focusBorder)}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:16px;border:1px solid var(--vscode-panel-border);max-height:60vh;overflow:auto}table{border-collapse:collapse;width:100%}td,th{padding:8px;text-align:left;border-bottom:1px solid var(--vscode-panel-border);overflow-wrap:anywhere}p{overflow-wrap:anywhere}.error{color:var(--vscode-errorForeground)}
      </style></head><body><h1>Recover Canvas Drafts</h1><p>Preserved ${escape(new Date(file.entry.modified).toLocaleString())} · Workspace ${escape(choice.id)}</p>
      <p>${layout ? `${layout.nodes.length} layout nodes` : 'No layout draft'} · ${notes.length} pending note drafts · ${savedNotes} other notes to copy from the original workspace.</p>
      <p><strong>Restore a copy</strong> saves a separate workspace in Recent workspaces. Original files and this recovery file are kept. No terminals, agents or pages start during restoration. Opening the copy later uses the usual shell startup behavior.</p><p>Task areas, tasks and team runs are not copied. Area links are removed; peer links require approval. Terminal directories and saved agent settings remain in the copy. Other notes use the current saved contents; close their source canvas first if it is locked.</p>
      <button id="restore" ${busy ? 'disabled' : ''}>${busy ? 'Saving recovery copy…' : 'Restore a copy'}</button>${layout && notes.length ? `<button id="restore-notes" ${busy ? 'disabled' : ''}>Restore pending notes only</button><p>Pending notes can be restored without access to the original workspace.</p>` : ''}<p role="status" class="${error ? 'error' : ''}">${escape(status)}</p>
      ${layout ? `<h2>Layout preview</h2><table><thead><tr><th scope="col">Node</th><th scope="col">Kind</th><th scope="col">Directory / note</th></tr></thead><tbody>${layout.nodes.map((node) => `<tr><td>${escape(node.title)}</td><td>${escape(node.kind)}</td><td>${escape(node.cwd ?? node.relativePath ?? '')}</td></tr>`).join('')}</tbody></table>` : ''}
      ${notes.length ? `<h2>Note drafts</h2><label for="note">Choose a note</label><select id="note" ${busy ? 'disabled' : ''}>${notes.map((save, index) => `<option value="${index}" ${selected === index ? 'selected' : ''}>${escape(save.args.relativePath)}</option>`).join('')}</select><h3>Preserved draft</h3><pre tabindex="0">${escape(note?.args.content)}</pre><details><summary>Saved baseline when editing began</summary><pre tabindex="0">${escape(note?.args.expected)}</pre></details>` : ''}
      <script nonce="${nonce}">const api=acquireVsCodeApi();for(const action of ['restore','restore-notes']){const button=document.getElementById(action);if(button)button.onclick=()=>{for(const id of ['restore','restore-notes']){const b=document.getElementById(id);if(b)b.disabled=true;}api.postMessage({action});};}const note=document.getElementById('note');if(note)note.onchange=()=>api.postMessage({action:'note',index:Number(note.value)});</script></body></html>`;
  };
  panel.webview.onDidReceiveMessage(async (message: unknown) => {
    if (!record(message) || busy) return;
    if (
      message.action === 'note' &&
      Number.isSafeInteger(message.index) &&
      Number(message.index) >= 0 &&
      Number(message.index) < notes.length
    ) {
      selected = Number(message.index);
      render();
      return;
    }
    if (
      message.action !== 'restore' &&
      !(message.action === 'restore-notes' && notes.length)
    )
      return;
    busy = true;
    error = false;
    render();
    let host: ReturnType<typeof createHost> | undefined;
    try {
      if (!vscode.workspace.isTrusted)
        throw new Error('Trust this workspace before restoring drafts.');
      host = createHost();
      const result = await store.restore(
        draft,
        choice.id,
        host,
        message.action === 'restore-notes',
      );
      status = `Recovery copy saved: ${result.name} — ${result.folder}. Choose it from the canvas workspace picker, or use Open saved workspace with this folder. The current canvas was not switched.`;
    } catch (failure) {
      error = true;
      status = String(failure);
    } finally {
      await host?.stop();
      busy = false;
      render();
    }
  });
  render();
}
