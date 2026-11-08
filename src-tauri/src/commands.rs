use crate::workspace::{CatalogReply, Layout, Loaded, WorkspaceStore};
use crate::{
    pty::{PollReply, PtyManager, SpawnReply},
    shell::{self, ShellInfo},
};
use std::sync::{Arc, Mutex};
use tauri::State;

#[tauri::command]
pub fn shells() -> Vec<ShellInfo> {
    shell::presets()
}

#[tauri::command]
pub async fn terminal_spawn(
    manager: State<'_, Arc<PtyManager>>,
    id: String,
    shell: String,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<SpawnReply, String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.spawn(id, shell, cwd, cols, rows))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn terminal_write(
    manager: State<'_, Arc<PtyManager>>,
    id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.write(&id, data))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn terminal_resize(
    manager: State<'_, Arc<PtyManager>>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.resize(&id, cols, rows))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn terminal_poll(
    manager: State<'_, Arc<PtyManager>>,
    id: String,
    max_bytes: usize,
) -> Result<PollReply, String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.poll(&id, max_bytes))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn terminal_close(manager: State<'_, Arc<PtyManager>>, id: String) -> Result<(), String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.close(&id))
        .await
        .map_err(|e| e.to_string())?
}

type Storage = Arc<Mutex<WorkspaceStore>>;
async fn with_storage<T: Send + 'static>(
    storage: State<'_, Storage>,
    action: impl FnOnce(&mut WorkspaceStore) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut store = storage
            .lock()
            .map_err(|_| "Workspace storage unavailable")?;
        action(&mut store)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn workspace_list(storage: State<'_, Storage>) -> Result<CatalogReply, String> {
    with_storage(storage, |s| s.list()).await
}
#[tauri::command]
pub async fn workspace_create(
    storage: State<'_, Storage>,
    id: String,
    name: String,
    folder: Option<String>,
) -> Result<Loaded, String> {
    with_storage(storage, move |s| s.create(id, name, folder)).await
}
#[tauri::command]
pub async fn workspace_open(storage: State<'_, Storage>, id: String) -> Result<Loaded, String> {
    with_storage(storage, move |s| s.open(&id)).await
}
#[tauri::command]
pub async fn workspace_open_folder(
    storage: State<'_, Storage>,
    folder: String,
) -> Result<Loaded, String> {
    with_storage(storage, move |s| s.open_folder(folder)).await
}
#[tauri::command]
pub async fn workspace_save(
    storage: State<'_, Storage>,
    id: String,
    layout: Layout,
) -> Result<Loaded, String> {
    with_storage(storage, move |s| s.save(&id, layout)).await
}
#[tauri::command]
pub async fn workspace_release(storage: State<'_, Storage>, id: String) -> Result<(), String> {
    with_storage(storage, move |s| {
        s.release(&id);
        Ok(())
    })
    .await
}
#[tauri::command]
pub async fn workspace_activate(storage: State<'_, Storage>, id: String) -> Result<(), String> {
    with_storage(storage, move |s| s.activate(&id)).await
}
