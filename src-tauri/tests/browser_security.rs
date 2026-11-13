use agent_canvas_desktop::invoke_guard::main_only;
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::{LogicalPosition, LogicalSize, Manager, WebviewUrl};
static CALLS: AtomicUsize = AtomicUsize::new(0);
#[tauri::command]
fn privileged_probe() -> bool {
    CALLS.fetch_add(1, Ordering::SeqCst);
    true
}

#[test]
fn child_in_same_window_cannot_invoke_even_from_a_trusted_local_origin() {
    let app = tauri::test::mock_builder()
        .invoke_handler(|invoke| main_only(invoke, tauri::generate_handler![privileged_probe]))
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap();
    let main = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let child = std::sync::Arc::new(
        app.get_window("main")
            .unwrap()
            .add_child(
                tauri::webview::WebviewBuilder::new(
                    "browser-untrusted",
                    WebviewUrl::External("https://example.com".parse().unwrap()),
                ),
                LogicalPosition::new(0., 0.),
                LogicalSize::new(300., 200.),
            )
            .unwrap(),
    );
    let request = |url: &str| tauri::webview::InvokeRequest {
        cmd: "privileged_probe".into(),
        callback: tauri::ipc::CallbackFn(0),
        error: tauri::ipc::CallbackFn(1),
        url: url.parse().unwrap(),
        body: tauri::ipc::InvokeBody::default(),
        headers: Default::default(),
        invoke_key: tauri::test::INVOKE_KEY.into(),
    };
    assert!(tauri::test::get_ipc_response(&main, request("http://tauri.localhost")).is_ok());
    assert_eq!(CALLS.load(Ordering::SeqCst), 1);
    for url in [
        "http://tauri.localhost",
        "tauri://localhost",
        "https://example.com",
    ] {
        assert!(tauri::test::get_ipc_response(&child, request(url)).is_err());
    }
    assert_eq!(
        CALLS.load(Ordering::SeqCst),
        1,
        "child must never reach privileged handler"
    );
    let capability: serde_json::Value =
        serde_json::from_str(include_str!("../capabilities/main.json")).unwrap();
    assert!(
        capability.get("windows").is_none(),
        "window capabilities would include child webviews"
    );
    assert!(capability.get("remote").is_none());
    assert_eq!(capability["webviews"], serde_json::json!(["main"]));
}
