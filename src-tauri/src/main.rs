#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use agent_canvas_desktop::{commands, pty};
use std::sync::Arc;

fn main() {
    let manager = Arc::new(pty::PtyManager::default());
    let shutdown = manager.clone();
    let product: serde_json::Value = serde_json::from_str(include_str!("../../product.json"))
        .expect("product configuration");
    let title = product["name"].as_str().expect("product name").to_owned();
    tauri::Builder::default()
        .manage(manager)
        .setup(move |app| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                window.set_title(&title)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::shells,
            commands::terminal_spawn,
            commands::terminal_write,
            commands::terminal_resize,
            commands::terminal_poll,
            commands::terminal_close
        ])
        .build(tauri::generate_context!())
        .expect("desktop runtime failed")
        .run(move |_, event| {
            if matches!(
                event,
                tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
            ) {
                shutdown.shutdown();
            }
        });
}
