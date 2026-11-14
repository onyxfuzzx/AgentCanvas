use crate::collaboration::{Collaboration, Snapshot};
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
pub fn agent_providers() -> Vec<crate::agents::Availability> {
    crate::agents::providers()
}
#[tauri::command]
pub async fn agent_catalog(
    storage: State<'_, Storage>,
) -> Result<crate::agents::LibraryReply, String> {
    with_storage(storage, |s| crate::agents::catalog(s.data_dir())).await
}
#[tauri::command]
pub async fn agent_catalog_save(
    storage: State<'_, Storage>,
    expected: Option<String>,
    library: crate::agents::Library,
) -> Result<crate::agents::LibraryReply, String> {
    with_storage(storage, move |s| {
        crate::agents::save(s.data_dir(), expected, library)
    })
    .await
}

#[tauri::command]
#[allow(clippy::too_many_arguments)] // Flat IPC fields preserve the existing shell command contract.
pub async fn terminal_spawn(
    manager: State<'_, Arc<PtyManager>>,
    git_gate: State<'_, Arc<Mutex<()>>>,
    collaboration: State<'_, Arc<Collaboration>>,
    id: String,
    shell: String,
    cwd: String,
    cols: u16,
    rows: u16,
    agent: Option<crate::agents::AgentLaunch>,
) -> Result<SpawnReply, String> {
    if agent.is_some() && shell != "cmd" {
        return Err("Agent launches require the cmd metadata placeholder".into());
    }
    let manager = manager.inner().clone();
    let collaboration = collaboration.inner().clone();
    let git_gate = git_gate.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _gate = git_gate
            .lock()
            .map_err(|_| "Git operation gate unavailable")?;
        if manager.has_session(&id)? {
            return Err("Terminal already exists; stop it before starting again".into());
        }
        collaboration.validate_area_launch(&id, &cwd)?;
        let environment = collaboration.attach(&id)?;
        let result = match agent {
            Some(agent) => manager.spawn_agent(id.clone(), agent, cwd, cols, rows, environment),
            None => manager.spawn_with_env(id.clone(), shell, cwd, cols, rows, environment),
        };
        if result.is_err() {
            collaboration.detach(&id);
        }
        result
    })
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
    collaboration: State<'_, Arc<Collaboration>>,
    id: String,
    max_bytes: usize,
) -> Result<PollReply, String> {
    let manager = manager.inner().clone();
    let collaboration = collaboration.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let generation = collaboration.generation(&id);
        let reply = manager.poll(&id, max_bytes)?;
        if reply.exit_code.is_some() {
            if let Some(generation) = generation {
                collaboration.process_exited(&id, &generation);
            }
        }
        Ok(reply)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn terminal_close(
    manager: State<'_, Arc<PtyManager>>,
    collaboration: State<'_, Arc<Collaboration>>,
    id: String,
) -> Result<(), String> {
    let manager = manager.inner().clone();
    let collaboration = collaboration.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        collaboration.begin_close(&id)?;
        let result = manager.close(&id);
        if result.is_ok() {
            collaboration.detach(&id);
        }
        result
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn collaboration_sync(
    storage: State<'_, Storage>,
    collaboration: State<'_, Arc<Collaboration>>,
    workspace_id: String,
    layout: Layout,
) -> Result<(), String> {
    let collaboration = collaboration.inner().clone();
    with_storage(storage, move |s| {
        collaboration.configure(&workspace_id, layout, s.folder(&workspace_id)?)
    })
    .await
}
#[tauri::command]
pub async fn collaboration_snapshot(
    collaboration: State<'_, Arc<Collaboration>>,
    after: u64,
) -> Result<Option<Snapshot>, String> {
    let collaboration = collaboration.inner().clone();
    tauri::async_runtime::spawn_blocking(move || collaboration.snapshot(after))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn collaboration_decide(
    collaboration: State<'_, Arc<Collaboration>>,
    id: u64,
    allow: bool,
) -> Result<(), String> {
    let collaboration = collaboration.inner().clone();
    tauri::async_runtime::spawn_blocking(move || collaboration.decide(id, allow))
        .await
        .map_err(|e| e.to_string())?
}

type Storage = Arc<Mutex<WorkspaceStore>>;
#[tauri::command]
pub async fn area_catalog(
    storage: State<'_, Storage>,
    workspace_id: String,
) -> Result<crate::areas::Catalog, String> {
    with_storage(storage, move |s| {
        crate::areas::catalog(s.folder(&workspace_id)?)
    })
    .await
}
#[tauri::command]
pub async fn area_review(
    storage: State<'_, Storage>,
    workspace_id: String,
    id: String,
) -> Result<crate::areas::Review, String> {
    with_storage(storage, move |s| {
        crate::areas::review(s.folder(&workspace_id)?, &id)
    })
    .await
}
#[tauri::command]
pub async fn area_file(
    storage: State<'_, Storage>,
    workspace_id: String,
    id: String,
    relative: String,
) -> Result<String, String> {
    with_storage(storage, move |s| {
        crate::areas::file(s.folder(&workspace_id)?, &id, &relative)
    })
    .await
}
#[tauri::command]
pub async fn area_preview(
    storage: State<'_, Storage>,
    workspace_id: String,
    id: String,
    target: String,
) -> Result<crate::areas::Approval, String> {
    with_storage(storage, move |s| {
        crate::areas::preview(s.folder(&workspace_id)?, &id, &target)
    })
    .await
}
#[tauri::command]
pub async fn area_action(
    storage: State<'_, Storage>,
    manager: State<'_, Arc<PtyManager>>,
    collaboration: State<'_, Arc<Collaboration>>,
    git_gate: State<'_, Arc<Mutex<()>>>,
    workspace_id: String,
    action: crate::areas::Action,
) -> Result<crate::areas::Catalog, String> {
    let manager = manager.inner().clone();
    let collaboration = collaboration.inner().clone();
    let gate = git_gate.inner().clone();
    with_storage(storage, move |s| {
        let _gate = gate.lock().map_err(|_| "Git operation gate unavailable")?;
        manager.require_idle()?;
        match &action {
            crate::areas::Action::Cleanup { id } | crate::areas::Action::Integrate { id, .. } => {
                collaboration.area_available(&workspace_id, id)?
            }
            _ => {}
        }
        crate::areas::action(s.folder(&workspace_id)?, action)
    })
    .await
}
#[tauri::command]
pub async fn task_snapshot(
    collaboration: State<'_, Arc<Collaboration>>,
    workspace_id: String,
) -> Result<crate::tasks::Snapshot, String> {
    let collaboration = collaboration.inner().clone();
    tauri::async_runtime::spawn_blocking(move || collaboration.task_snapshot(&workspace_id))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn task_action(
    collaboration: State<'_, Arc<Collaboration>>,
    workspace_id: String,
    request_id: String,
    revision: u64,
    action: crate::tasks::Action,
) -> Result<crate::tasks::Snapshot, String> {
    let collaboration = collaboration.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        collaboration.task_action(&workspace_id, &request_id, revision, action)
    })
    .await
    .map_err(|e| e.to_string())?
}
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
#[tauri::command]
pub async fn note_create(
    storage: State<'_, Storage>,
    workspace_id: String,
    id: String,
) -> Result<String, String> {
    with_storage(storage, move |s| {
        crate::notes::create(s, &workspace_id, &id)
    })
    .await
}
#[tauri::command]
pub async fn note_read(
    storage: State<'_, Storage>,
    workspace_id: String,
    relative_path: String,
) -> Result<String, String> {
    with_storage(storage, move |s| {
        crate::notes::read(s, &workspace_id, &relative_path)
    })
    .await
}
#[tauri::command]
pub async fn note_save(
    storage: State<'_, Storage>,
    workspace_id: String,
    relative_path: String,
    expected: String,
    content: String,
) -> Result<(), String> {
    with_storage(storage, move |s| {
        crate::notes::save(s, &workspace_id, &relative_path, &expected, &content)
    })
    .await
}
