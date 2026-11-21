type EditorApi = { postMessage: (message: unknown) => void };
declare global {
  interface Window {
    acquireVsCodeApi?: () => EditorApi;
  }
}
// The editor API stays private; terminal bytes never gain access to it.
const api =
  typeof window === 'undefined' ? undefined : window.acquireVsCodeApi?.();
export const isEditor = () => Boolean(api);
let sequence = 0;
const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();
const closeListeners = new Set<() => void>();
const setupListeners = new Set<() => void>();
let setupRequested = false;
let save: (() => Promise<void>) | undefined;
let capture: (() => void) | undefined;
const generation =
  typeof document === 'undefined'
    ? 1
    : Number(document.body.dataset.generation || 1);
let backendPhase = 'starting';
let backendError = '';
let connectedResolve!: () => void;
const connected = new Promise<void>((resolve) => {
  connectedResolve = resolve;
});
function send(message: Record<string, unknown>) {
  api?.postMessage({ ...message, generation });
}

function backendStatus(state: Record<string, unknown>) {
  backendPhase = String(state.phase);
  backendError = String(
    state.error || 'Backend unavailable. Use Restart Backend.',
  );
  if (backendPhase !== 'starting') connectedResolve();
  if (backendPhase !== 'connected') {
    for (const request of pending.values())
      request.reject(new Error(backendError));
    pending.clear();
  }
  const root = document.getElementById('root');
  if (root) root.inert = backendPhase !== 'connected';
  const overlay = document.getElementById('backend-status');
  if (overlay) overlay.hidden = backendPhase === 'connected';
  const title = document.getElementById('backend-title');
  if (title)
    title.textContent =
      backendPhase === 'failed'
        ? 'Backend unavailable'
        : backendPhase === 'restarting'
          ? 'Recovering your canvas…'
          : backendPhase === 'stopping'
            ? 'Stopping backend…'
            : 'Starting backend…';
  const detail = document.getElementById('backend-detail');
  if (detail)
    detail.textContent =
      backendPhase === 'failed'
        ? `${backendError}${state.recoveryPath ? ` Drafts preserved at ${String(state.recoveryPath)}.` : ''}`
        : 'Your canvas will remain paused while the backend reconnects.';
  const restart = document.getElementById(
    'backend-restart',
  ) as HTMLButtonElement | null;
  if (restart) {
    restart.hidden = backendPhase !== 'failed';
    restart.disabled = Number(state.attempts) >= 3;
    if (restart.disabled && detail)
      detail.textContent +=
        ' Restart limit reached. Close and reopen the canvas; preserved drafts remain available.';
  }
  const close = document.getElementById('backend-close');
  if (close) close.hidden = backendPhase === 'connected';
}

if (api) {
  document.documentElement.classList.add('editor-host');
  window.addEventListener('message', (event: MessageEvent) => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    if (message.generation !== generation) return;
    if (
      message.type === 'agentcanvas:backend' &&
      message.state &&
      typeof message.state === 'object'
    ) {
      backendStatus(message.state);
      return;
    }
    if (message.type === 'agentcanvas:capture') {
      try {
        if (!capture) throw new Error('Canvas is still loading.');
        capture();
        send({ type: 'agentcanvas:captured', id: message.id });
      } catch (error) {
        send({
          type: 'agentcanvas:captured',
          id: message.id,
          error: String(error),
        });
      }
      return;
    }
    if (
      message.type === 'agentcanvas:reply' &&
      Number.isSafeInteger(message.id)
    ) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (typeof message.error === 'string')
        request.reject(new Error(message.error));
      else request.resolve(message.result);
    } else if (message.type === 'agentcanvas:close') {
      closeListeners.forEach((listener) => listener());
    } else if (message.type === 'agentcanvas:setup') {
      if (setupListeners.size) setupListeners.forEach((listener) => listener());
      else setupRequested = true;
    } else if (
      message.type === 'agentcanvas:save' &&
      Number.isSafeInteger(message.id)
    ) {
      void (save?.() ?? Promise.reject(new Error('Canvas is still loading.')))
        .then(() => send({ type: 'agentcanvas:saved', id: message.id }))
        .catch((error) =>
          send({
            type: 'agentcanvas:saved',
            id: message.id,
            error: String(error),
          }),
        );
    }
  });
  document
    .getElementById('backend-restart')
    ?.addEventListener('click', () => send({ type: 'agentcanvas:restart' }));
  document
    .getElementById('backend-close')
    ?.addEventListener('click', () => send({ type: 'agentcanvas:dispose' }));
  send({ type: 'agentcanvas:ready' });
}

export async function editorInvoke<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!api) return Promise.reject(new Error('Editor host is unavailable.'));
  if (backendPhase === 'starting') await connected;
  if (backendPhase !== 'connected') throw new Error(backendError);
  if (pending.size >= 128)
    return Promise.reject(new Error('Editor request limit reached.'));
  const id = ++sequence;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: (value) => resolve(value as T), reject });
    try {
      send({ type: 'agentcanvas:invoke', id, command, args });
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}

/** Mirror only pending durable saves so editor-tab disposal can flush them. */
export function checkpoint(command: string, args: Record<string, unknown>) {
  send({ type: 'agentcanvas:checkpoint', command, args });
}
export function registerEditorCapture(handler: () => void) {
  capture = handler;
}
export function editorWorkspaceReady() {
  send({ type: 'agentcanvas:workspaceReady' });
}
export const editorRestorePaused = () =>
  isEditor() && document.body.dataset.paused === 'true';
export function onEditorClose(handler: () => void) {
  closeListeners.add(handler);
  return () => {
    closeListeners.delete(handler);
  };
}
export function registerEditorSave(handler: () => Promise<void>) {
  save = handler;
}
export function onEditorSetup(handler: () => void) {
  setupListeners.add(handler);
  if (setupRequested) {
    setupRequested = false;
    handler();
  }
  return () => {
    setupListeners.delete(handler);
  };
}
