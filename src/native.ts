type NativeWindow = {
  startDragging: () => Promise<void>;
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<void>;
  close: () => Promise<void>;
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
export const isDesktop = () => Boolean(window.__TAURI__);
export function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!window.__TAURI__)
    return Promise.reject(
      new Error('Open the desktop app to use native terminals.'),
    );
  return window.__TAURI__.core.invoke<T>(command, args);
}
export function windowAction(action: keyof NativeWindow) {
  const nativeWindow = window.__TAURI__?.window.getCurrentWindow();
  return nativeWindow?.[action]().catch(console.error);
}
