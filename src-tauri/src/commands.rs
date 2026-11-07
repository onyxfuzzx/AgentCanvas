use crate::{
    pty::{PollReply, PtyManager, SpawnReply},
    shell::{self, ShellInfo},
};
use std::sync::Arc;
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
pub async fn terminal_close(
    manager: State<'_, Arc<PtyManager>>,
    id: String,
) -> Result<(), String> {
    let manager = manager.inner().clone();
    tauri::async_runtime::spawn_blocking(move || manager.close(&id))
        .await
        .map_err(|e| e.to_string())?
}
