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

if (api) {
  document.documentElement.classList.add('editor-host');
  window.addEventListener('message', (event: MessageEvent) => {
    const message = event.data;
    if (!message || typeof message !== 'object') return;
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
        .then(() =>
          api.postMessage({ type: 'agentcanvas:saved', id: message.id }),
        )
        .catch((error) =>
          api.postMessage({
            type: 'agentcanvas:saved',
            id: message.id,
            error: String(error),
          }),
        );
    }
  });
  api.postMessage({ type: 'agentcanvas:ready' });
}

export function editorInvoke<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!api) return Promise.reject(new Error('Editor host is unavailable.'));
  if (pending.size >= 128)
    return Promise.reject(new Error('Editor request limit reached.'));
  const id = ++sequence;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: (value) => resolve(value as T), reject });
    try {
      api.postMessage({ type: 'agentcanvas:invoke', id, command, args });
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}

/** Mirror only pending durable saves so editor-tab disposal can flush them. */
export function checkpoint(command: string, args: Record<string, unknown>) {
  api?.postMessage({ type: 'agentcanvas:checkpoint', command, args });
}
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
