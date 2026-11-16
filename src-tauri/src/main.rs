#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use agent_canvas_desktop::{commands, pty, workspace::WorkspaceStore};
use std::sync::{Arc, Mutex};

fn main() {
    let manager = Arc::new(pty::PtyManager::default());
    let shutdown = manager.clone();
    let checks = Arc::new(agent_canvas_desktop::check_runner::CheckRunner::default());
    let stop_checks = checks.clone();
    let scheduler_stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let stop_scheduler = scheduler_stop.clone();
    let collaboration = Arc::new(
        agent_canvas_desktop::collaboration::Collaboration::new(manager.clone())
            .expect("local collaboration setup"),
    );
    let server = Mutex::new(Some(
        agent_canvas_desktop::ipc::Server::start(collaboration.clone())
            .expect("local named-pipe server"),
    ));
    let scheduler = Arc::downgrade(&collaboration);
    std::thread::spawn(move || {
        while !scheduler_stop.load(std::sync::atomic::Ordering::SeqCst) {
            let Some(c) = scheduler.upgrade() else {
                break;
            };
            c.team_tick();
            drop(c);
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    });
    let product: serde_json::Value =
        serde_json::from_str(include_str!("../../product.json")).expect("product configuration");
    let title = product["name"].as_str().expect("product name").to_owned();
    let mut context = tauri::generate_context!();
    // Respect WebView2's per-process data-folder override before Tauri attempts
    // to create its default app-data folder (useful in restricted dev hosts).
    #[cfg(windows)]
    if let Some(directory) =
        std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").filter(|value| !value.is_empty())
    {
        for window in &mut context.config_mut().app.windows {
            window.data_directory = Some(std::path::PathBuf::from(&directory));
        }
    }
    tauri::Builder::default()
        .manage(manager)
        .manage(checks)
        .manage(Arc::new(Mutex::new(())))
        .manage(collaboration)
        .manage(Arc::new(agent_canvas_desktop::browser::Browsers::default()))
        .setup(move |app| {
            use tauri::Manager;
            let data = std::env::var_os("AGENTCANVAS_DATA_DIR")
                .map(std::path::PathBuf::from)
                .unwrap_or(app.path().app_local_data_dir()?);
            app.manage(Arc::new(Mutex::new(WorkspaceStore::new(
                data,
                app.path().home_dir()?,
            ))));
            if let Some(window) = app.get_webview_window("main") {
                window.set_title(&title)?;
            }
            Ok(())
        })
        .invoke_handler(|invoke| {
            let handler: fn(tauri::ipc::Invoke<tauri::Wry>) -> bool = tauri::generate_handler![
                agent_canvas_desktop::browser::browser_open,
                agent_canvas_desktop::browser::browser_sync,
                agent_canvas_desktop::browser::browser_snapshot,
                agent_canvas_desktop::browser::browser_action,
                agent_canvas_desktop::browser::browser_close,
                agent_canvas_desktop::browser::browser_close_all,
                commands::shells,
                commands::agent_providers,
                commands::task_snapshot,
                commands::task_action,
                commands::team_snapshot,
                commands::team_pause_workspace,
                commands::team_control,
                commands::team_emergency_stop,
                commands::team_launch,
                commands::team_check_run,
                commands::area_catalog,
                commands::area_review,
                commands::area_file,
                commands::area_file_location,
                commands::area_preview,
                commands::area_action,
                commands::agent_catalog,
                commands::agent_catalog_save,
                commands::terminal_spawn,
                commands::terminal_write,
                commands::terminal_resize,
                commands::terminal_poll,
                commands::terminal_close,
                commands::workspace_list,
                commands::workspace_create,
                commands::workspace_open,
                commands::workspace_open_folder,
                commands::workspace_save,
                commands::workspace_release,
                commands::workspace_activate,
                commands::note_create,
                commands::note_read,
                commands::note_save,
                commands::collaboration_sync,
                commands::collaboration_snapshot,
                commands::collaboration_decide
            ];
            agent_canvas_desktop::invoke_guard::main_only(invoke, handler)
        })
        .build(context)
        .expect("desktop runtime failed")
        .run(move |_, event| {
            if matches!(
                event,
                tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
            ) {
                stop_scheduler.store(true, std::sync::atomic::Ordering::SeqCst);
                stop_checks.stop();
                shutdown.shutdown();
                if let Ok(mut server) = server.lock() {
                    server.take();
                }
            }
        });
}
