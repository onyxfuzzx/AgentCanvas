/// Never authorize a native app command by URL alone: browser nodes may visit
/// the development server or another address considered local by Tauri.
pub fn main_only<R: tauri::Runtime>(
    invoke: tauri::ipc::Invoke<R>,
    dispatch: impl FnOnce(tauri::ipc::Invoke<R>) -> bool,
) -> bool {
    if invoke.message.webview_ref().label() != "main" {
        invoke
            .resolver
            .reject("Browser pages cannot invoke native app commands");
        return true;
    }
    dispatch(invoke)
}
