//! Bounded stdio RPC for the editor extension. No listener or shell execution API.
use crate::{command_state::State, commands, pty::PtyManager, workspace::WorkspaceStore};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    io::{BufRead, Write},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

pub const MAX_FRAME: usize = 8 * 1024 * 1024;
const WORKERS: usize = 8;
const QUEUE: usize = 64;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub id: u64,
    pub command: String,
    #[serde(default = "empty_args")]
    pub args: Value,
}
fn empty_args() -> Value {
    json!({})
}

pub struct Runtime {
    manager: Arc<PtyManager>,
    checks: Arc<crate::check_runner::CheckRunner>,
    collaboration: Arc<crate::collaboration::Collaboration>,
    storage: Arc<Mutex<WorkspaceStore>>,
    gate: Arc<Mutex<()>>,
    stopped: Arc<AtomicBool>,
    quiescing: Arc<AtomicBool>,
    _server: crate::ipc::Server,
}

macro_rules! call {
    ($args:expr, $function:path, [$($state:expr),*], {$($name:ident: $kind:ty),* $(,)?}) => {{
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Args { $($name: $kind),* }
        let _args: Args = serde_json::from_value($args).map_err(|e| e.to_string())?;
        let result = $function($($state,)* $(_args.$name),*).await?;
        serde_json::to_value(result).map_err(|e| e.to_string())
    }};
}

impl Runtime {
    pub fn new(data: PathBuf, home: PathBuf) -> Result<Self, String> {
        if !data.is_absolute() || !home.is_absolute() || !home.is_dir() {
            return Err(
                "Editor data and home directories must be absolute; home must exist".into(),
            );
        }
        let manager = Arc::new(PtyManager::default());
        let collaboration = Arc::new(crate::collaboration::Collaboration::new(manager.clone())?);
        let server = crate::ipc::Server::start(collaboration.clone())?;
        let stopped = Arc::new(AtomicBool::new(false));
        let stop = stopped.clone();
        let quiescing = Arc::new(AtomicBool::new(false));
        let paused = quiescing.clone();
        let scheduler = Arc::downgrade(&collaboration);
        std::thread::spawn(move || {
            while !stop.load(Ordering::SeqCst) {
                let Some(c) = scheduler.upgrade() else {
                    break;
                };
                if !paused.load(Ordering::SeqCst) {
                    c.team_tick();
                }
                drop(c);
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
        });
        Ok(Self {
            manager,
            collaboration,
            stopped,
            quiescing,
            _server: server,
            checks: Arc::new(crate::check_runner::CheckRunner::default()),
            storage: Arc::new(Mutex::new(WorkspaceStore::new(data, home))),
            gate: Arc::new(Mutex::new(())),
        })
    }

    pub fn stop(&self) {
        self.stopped.store(true, Ordering::SeqCst);
        self.checks.stop();
        self.manager.shutdown();
    }

    pub fn quiesce(&self) {
        self.quiescing.store(true, Ordering::SeqCst);
        self.checks.stop();
        self.manager.shutdown();
    }

    pub async fn dispatch(&self, request: Request) -> Result<Value, String> {
        if self.stopped.load(Ordering::SeqCst) {
            return Err("Editor host is stopping".into());
        }
        if self.quiescing.load(Ordering::SeqCst)
            && matches!(
                request.command.as_str(),
                "terminal_spawn" | "team_launch" | "team_check_run" | "team_control"
            )
        {
            return Err("Canvas is closing".into());
        }
        let storage = || State::new(&self.storage);
        let manager = || State::new(&self.manager);
        let collaboration = || State::new(&self.collaboration);
        let checks = || State::new(&self.checks);
        let gate = || State::new(&self.gate);
        let a = request.args;
        match request.command.as_str() {
            "shells" | "agent_providers" => {
                if a != json!({}) {
                    return Err("This command takes no arguments".into());
                }
                if request.command == "shells" {
                    serde_json::to_value(commands::shells())
                } else {
                    serde_json::to_value(commands::agent_providers())
                }
                .map_err(|e| e.to_string())
            }
            "agent_catalog" => call!(a, commands::agent_catalog, [storage()], {}),
            "agent_inspect" => {
                call!(a, commands::agent_inspect, [], {provider: crate::agents::Provider, executable: Option<String>})
            }
            "agent_catalog_save" => {
                call!(a, commands::agent_catalog_save, [storage()], {expected: Option<String>, library: crate::agents::Library})
            }
            "terminal_spawn" => {
                call!(a, commands::terminal_spawn, [manager(), gate(), collaboration()], {id: String, shell: String, cwd: String, cols: u16, rows: u16, agent: Option<crate::agents::AgentLaunch>})
            }
            "terminal_write" => {
                call!(a, commands::terminal_write, [manager()], {id: String, data: Vec<u8>})
            }
            "terminal_resize" => {
                call!(a, commands::terminal_resize, [manager()], {id: String, cols: u16, rows: u16})
            }
            "terminal_poll" => {
                call!(a, commands::terminal_poll, [manager(), collaboration()], {id: String, max_bytes: usize})
            }
            "terminal_close" => {
                call!(a, commands::terminal_close, [manager(), collaboration()], {id: String})
            }
            "workspace_list" => call!(a, commands::workspace_list, [storage()], {}),
            "workspace_create" => {
                call!(a, commands::workspace_create, [storage()], {id: String, name: String, folder: Option<String>})
            }
            "workspace_open" => call!(a, commands::workspace_open, [storage()], {id: String}),
            "workspace_open_folder" => {
                call!(a, commands::workspace_open_folder, [storage()], {folder: String})
            }
            "workspace_save" => {
                call!(a, commands::workspace_save, [storage()], {id: String, layout: crate::workspace::Layout})
            }
            "workspace_release" => call!(a, commands::workspace_release, [storage()], {id: String}),
            "workspace_activate" => {
                call!(a, commands::workspace_activate, [storage()], {id: String})
            }
            "note_create" => {
                call!(a, commands::note_create, [storage()], {workspace_id: String, id: String})
            }
            "note_read" => {
                call!(a, commands::note_read, [storage()], {workspace_id: String, relative_path: String})
            }
            "note_save" => {
                call!(a, commands::note_save, [storage()], {workspace_id: String, relative_path: String, expected: String, content: String})
            }
            "collaboration_sync" => {
                call!(a, commands::collaboration_sync, [storage(), collaboration()], {workspace_id: String, layout: crate::workspace::Layout})
            }
            "collaboration_snapshot" => {
                call!(a, commands::collaboration_snapshot, [collaboration()], {after: u64})
            }
            "collaboration_decide" => {
                call!(a, commands::collaboration_decide, [collaboration()], {id: u64, allow: bool})
            }
            "task_snapshot" => {
                call!(a, commands::task_snapshot, [collaboration()], {workspace_id: String})
            }
            "task_action" => {
                call!(a, commands::task_action, [collaboration()], {workspace_id: String, request_id: String, revision: u64, action: crate::tasks::Action})
            }
            "team_snapshot" => {
                call!(a, commands::team_snapshot, [collaboration(), checks()], {workspace_id: String})
            }
            "team_pause_workspace" => {
                call!(a, commands::team_pause_workspace, [collaboration()], {workspace_id: String})
            }
            "team_control" => {
                call!(a, commands::team_control, [collaboration(), checks()], {workspace_id: String, revision: u64, control: crate::orchestrator::Control})
            }
            "team_emergency_stop" => {
                call!(a, commands::team_emergency_stop, [collaboration(), checks()], {workspace_id: String})
            }
            "team_launch" => {
                call!(a, commands::team_launch, [collaboration(), gate()], {workspace_id: String, id: String, cols: u16, rows: u16})
            }
            "team_check_run" => {
                call!(a, commands::team_check_run, [storage(), collaboration(), manager(), checks(), gate()], {workspace_id: String, run_id: String, id: String})
            }
            "area_catalog" => call!(a, commands::area_catalog, [storage()], {workspace_id: String}),
            "area_review" => {
                call!(a, commands::area_review, [storage()], {workspace_id: String, id: String})
            }
            "area_file" => {
                call!(a, commands::area_file, [storage()], {workspace_id: String, id: String, relative: String})
            }
            "area_file_location" => {
                call!(a, commands::area_file_location, [storage()], {workspace_id: String, id: String, relative: String})
            }
            "area_preview" => {
                call!(a, commands::area_preview, [storage()], {workspace_id: String, id: String, target: String})
            }
            "area_action" => {
                call!(a, commands::area_action, [storage(), manager(), collaboration(), gate()], {workspace_id: String, action: crate::areas::Action, run_id: Option<String>})
            }
            _ => Err("Unsupported editor command".into()),
        }
    }
}
impl Drop for Runtime {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Read at most one bounded line without allowing BufRead::read_line to grow unbounded.
pub fn read_frame(reader: &mut impl BufRead) -> Result<Option<Request>, String> {
    let mut bytes = Vec::new();
    loop {
        let chunk = reader.fill_buf().map_err(|e| e.to_string())?;
        if chunk.is_empty() {
            return if bytes.is_empty() {
                Ok(None)
            } else {
                Err("Incomplete editor frame".into())
            };
        }
        let count = chunk
            .iter()
            .position(|b| *b == b'\n')
            .map_or(chunk.len(), |i| i + 1);
        if bytes.len() + count > MAX_FRAME {
            return Err("Editor frame exceeds 8 MiB".into());
        }
        let complete = chunk[count - 1] == b'\n';
        bytes.extend_from_slice(&chunk[..count]);
        reader.consume(count);
        if complete {
            break;
        }
    }
    let request: Request = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    if request.id == 0
        || request.id > 9_007_199_254_740_991
        || request.command.len() > 64
        || !request.args.is_object()
    {
        return Err("Invalid editor request".into());
    }
    Ok(Some(request))
}

fn reply(id: u64, result: Result<Value, String>) {
    let frame = match result {
        Ok(value) => json!({"id": id, "result": value}),
        Err(error) => json!({"id": id, "error": error}),
    };
    if let Ok(mut data) = serde_json::to_vec(&frame) {
        if data.len() + 1 > MAX_FRAME {
            data =
                serde_json::to_vec(&json!({"id":id,"error":"Editor reply exceeds 8 MiB"})).unwrap();
        }
        data.push(b'\n');
        let mut out = std::io::stdout().lock();
        let _ = out.write_all(&data).and_then(|_| out.flush());
    }
}

pub fn serve(runtime: Runtime) -> Result<(), String> {
    let runtime = Arc::new(runtime);
    let (tx, rx) = std::sync::mpsc::sync_channel::<Request>(QUEUE);
    let rx = Arc::new(Mutex::new(rx));
    let mut workers = Vec::new();
    for _ in 0..WORKERS {
        let runtime = runtime.clone();
        let rx = rx.clone();
        workers.push(std::thread::spawn(move || loop {
            let request = match rx.lock().unwrap().recv() {
                Ok(r) => r,
                Err(_) => break,
            };
            let id = request.id;
            reply(
                id,
                tauri::async_runtime::block_on(runtime.dispatch(request)),
            );
        }));
    }
    let result = (|| {
        let mut input = std::io::stdin().lock();
        while let Some(request) = read_frame(&mut input)? {
            let id = request.id;
            // Cancellation bypasses workers blocked behind an active declared check.
            if request.command == "editor_quiesce" && request.args == json!({}) {
                runtime.quiesce();
                reply(id, Ok(Value::Null));
                continue;
            }
            if tx.try_send(request).is_err() {
                reply(id, Err("Editor request queue is full".into()));
            }
        }
        Ok(())
    })();
    runtime.stop();
    drop(tx);
    for worker in workers {
        let _ = worker.join();
    }
    runtime.stop();
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn frames_reject_truncation_unknown_fields_and_invalid_ids() {
        for frame in [
            "{",
            "{\"id\":0,\"command\":\"shells\"}\n",
            "{\"id\":1,\"command\":\"shells\",\"args\":[]}\n",
            "{\"id\":1,\"command\":\"shells\",\"extra\":true}\n",
        ] {
            assert!(read_frame(&mut frame.as_bytes()).is_err());
        }
        let mut input =
            b"{\"id\":1,\"command\":\"shells\"}\n{\"id\":2,\"command\":\"workspace_list\"}\n"
                .as_slice();
        assert_eq!(read_frame(&mut input).unwrap().unwrap().id, 1);
        assert_eq!(read_frame(&mut input).unwrap().unwrap().id, 2);
        assert!(read_frame(&mut input).unwrap().is_none());
    }
    #[test]
    fn frame_size_is_bounded() {
        let bytes = vec![b'x'; MAX_FRAME + 1];
        assert!(read_frame(&mut bytes.as_slice())
            .unwrap_err()
            .contains("8 MiB"));
    }
}
