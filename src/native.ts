import { editorInvoke, isEditor, onEditorClose } from './editor';

type NativeWindow = {
  startDragging: () => Promise<void>;
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
  destroy: () => Promise<void>;
  onCloseRequested: (
    handler: (event: { preventDefault: () => void }) => void,
  ) => Promise<() => void>;
};
declare global {
  interface Window {
    __TAURI__?: {
      core: {
        invoke: <T>(
          command: string,
          args?: Record<string, unknown>,
        ) => Promise<T>;
      };
      window: { getCurrentWindow: () => NativeWindow };
    };
  }
}
// Existing consumers use this as a privileged-host capability check.
export const isDesktop = () => Boolean(window.__TAURI__) || isEditor();
export function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (isEditor()) {
    // Editor browser nodes are address bookmarks; they own no native surfaces.
    if (command === 'browser_close_all' || command === 'browser_close')
      return Promise.resolve(undefined as T);
    return editorInvoke<T>(command, args);
  }
  if (!window.__TAURI__)
    return Promise.reject(
      new Error('Open the desktop app to use native terminals.'),
    );
  return window.__TAURI__.core.invoke<T>(command, args);
}
export function windowAction(
  action: Exclude<keyof NativeWindow, 'onCloseRequested'>,
) {
  if (isEditor()) {
    if (action === 'close' || action === 'destroy')
      return editorInvoke<void>('editor_dispose');
    return Promise.resolve();
  }
  const nativeWindow = window.__TAURI__?.window.getCurrentWindow();
  return nativeWindow?.[action]().catch(console.error);
}
export function onCloseRequested(
  handler: (event: { preventDefault: () => void }) => void,
) {
  if (isEditor())
    return Promise.resolve(
      onEditorClose(() => handler({ preventDefault: () => {} })),
    );
  return (
    window.__TAURI__?.window.getCurrentWindow().onCloseRequested(handler) ??
    Promise.resolve(() => {})
  );
}
export function destroyWindow() {
  if (isEditor()) return editorInvoke<void>('editor_dispose');
  return (
    window.__TAURI__?.window.getCurrentWindow().destroy() ?? Promise.resolve()
  );
}
