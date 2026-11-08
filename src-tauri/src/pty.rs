use crate::{output::Output, process_tree::Job, shell};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

const MAX_SESSIONS: usize = 20;
const MAX_INPUT: usize = 65536;

struct Session {
    job: Job,
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    output: Arc<Mutex<Output>>,
}

impl Session {
    fn stop(&self) {
        self.job.terminate();
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
        // Catch the trusted host joining between the first terminate and kill.
        self.job.terminate();
        if let Ok(mut master) = self.master.lock() {
            master.take();
        }
    }
}

impl Drop for Session {
    fn drop(&mut self) {
        self.stop();
    }
}

struct Entry {
    cancelled: Arc<AtomicBool>,
    session: Option<Arc<Session>>,
}

#[derive(Default)]
pub struct PtyManager {
    sessions: Mutex<HashMap<String, Entry>>,
    stopping: AtomicBool,
    host: Option<std::path::PathBuf>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnReply {
    cwd: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PollReply {
    bytes: Vec<u8>,
    dropped: u64,
    exited: bool,
    exit_code: Option<u32>,
    error: Option<String>,
}

fn valid_id(id: &str) -> Result<(), String> {
    if id.len() != 36
        || !id.bytes().enumerate().all(|(i, c)| {
            if [8, 13, 18, 23].contains(&i) {
                c == b'-'
            } else {
                c.is_ascii_hexdigit()
            }
        })
    {
        return Err("Invalid terminal ID".into());
    }
    Ok(())
}

fn size(cols: u16, rows: u16) -> Result<PtySize, String> {
    if !(2..=500).contains(&cols) || !(1..=300).contains(&rows) {
        return Err("Terminal size is outside supported bounds".into());
    }
    Ok(PtySize {
        cols,
        rows,
        pixel_width: 0,
        pixel_height: 0,
    })
}

impl PtyManager {
    /// Trusted helper override for native lifecycle tests; never exposed over IPC.
    pub fn with_host(host: std::path::PathBuf) -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            stopping: AtomicBool::new(false),
            host: Some(host),
        }
    }

    pub fn spawn(
        &self,
        id: String,
        preset: String,
        cwd: String,
        cols: u16,
        rows: u16,
    ) -> Result<SpawnReply, String> {
        valid_id(&id)?;
        let dimensions = size(cols, rows)?;
        let cwd = shell::directory(&cwd)?;
        shell::executable(&preset)?;
        let cancelled = Arc::new(AtomicBool::new(false));
        {
            let mut sessions = self
                .sessions
                .lock()
                .map_err(|_| "Session registry unavailable")?;
            if self.stopping.load(Ordering::SeqCst) {
                return Err("Application is closing".into());
            }
            if sessions.contains_key(&id) {
                return Err("Terminal already exists".into());
            }
            if sessions.len() >= MAX_SESSIONS {
                return Err("Maximum of 20 terminal sessions reached".into());
            }
            sessions.insert(
                id.clone(),
                Entry {
                    cancelled: cancelled.clone(),
                    session: None,
                },
            );
        }
        let result = (|| -> Result<Arc<Session>, String> {
            let job = Job::new(&id)?;
            let pair = native_pty_system()
                .openpty(dimensions)
                .map_err(|e| e.to_string())?;
            let app = std::env::current_exe().map_err(|e| e.to_string())?;
            let helper = match &self.host {
                Some(host) => host.clone(),
                None => app
                    .parent()
                    .ok_or("Application directory unavailable")?
                    .join("pty-host.exe"),
            };
            if !helper.is_file() {
                return Err("pty-host.exe must be alongside the desktop executable".into());
            }
            let mut command = CommandBuilder::new(helper);
            command.arg(&preset);
            command.arg(&cwd);
            command.cwd(&cwd);
            command.env("TERM", "xterm-256color");
            command.env("COLORTERM", "truecolor");
            command.env("AGENTCANVAS_NODE_ID", &id);
            command.env("AGENTCANVAS_JOB", &job.name);
            // Acquire streams before spawning: subsequent errors own a killable child.
            let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
            let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
            let child = pair
                .slave
                .spawn_command(command)
                .map_err(|e| e.to_string())?;
            drop(pair.slave);
            let output = Arc::new(Mutex::new(Output::default()));
            let session = Arc::new(Session {
                job,
                master: Mutex::new(Some(pair.master)),
                writer: Mutex::new(writer),
                child: Mutex::new(child),
                output: output.clone(),
            });
            let _reader = std::thread::Builder::new()
                .name(format!("pty-read-{id}"))
                .spawn(move || {
                    let mut buffer = [0u8; 16384];
                    loop {
                        match reader.read(&mut buffer) {
                            Ok(0) => break,
                            Ok(n) => {
                                if let Ok(mut out) = output.lock() {
                                    out.push(&buffer[..n]);
                                } else {
                                    return;
                                }
                            }
                            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                            Err(e)
                                if matches!(
                                    e.kind(),
                                    std::io::ErrorKind::BrokenPipe
                                        | std::io::ErrorKind::UnexpectedEof
                                ) =>
                            {
                                break;
                            }
                            Err(e) => {
                                if let Ok(mut out) = output.lock() {
                                    out.error = Some(e.to_string());
                                }
                                break;
                            }
                        }
                    }
                    if let Ok(mut out) = output.lock() {
                        out.eof = true;
                    }
                })
                .map_err(|e| e.to_string())?;
            Ok(session)
        })();
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Session registry unavailable")?;
        if cancelled.load(Ordering::SeqCst) || self.stopping.load(Ordering::SeqCst) {
            if let Ok(session) = result {
                session.stop();
            }
            return Err("Terminal creation was cancelled".into());
        }
        match result {
            Ok(session) => {
                let entry = sessions.get_mut(&id).ok_or("Terminal creation cancelled")?;
                entry.session = Some(session);
                Ok(SpawnReply {
                    cwd: cwd.to_string_lossy().into_owned(),
                })
            }
            Err(error) => {
                sessions.remove(&id);
                Err(error)
            }
        }
    }

    fn get(&self, id: &str) -> Result<Arc<Session>, String> {
        valid_id(id)?;
        self.sessions
            .lock()
            .map_err(|_| "Session registry unavailable")?
            .get(id)
            .and_then(|entry| entry.session.clone())
            .ok_or_else(|| "Terminal is not running".into())
    }

    pub fn write(&self, id: &str, data: Vec<u8>) -> Result<(), String> {
        if data.len() > MAX_INPUT {
            return Err("Input chunk exceeds 64 KiB".into());
        }
        let session = self.get(id)?;
        let mut writer = session
            .writer
            .lock()
            .map_err(|_| "Terminal input unavailable")?;
        writer
            .write_all(&data)
            .and_then(|_| writer.flush())
            .map_err(|e| e.to_string())
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let dimensions = size(cols, rows)?;
        let session = self.get(id)?;
        let guard = session.master.lock().map_err(|_| "Terminal unavailable")?;
        let master = guard.as_ref().ok_or("Terminal has exited")?;
        master.resize(dimensions).map_err(|e| e.to_string())
    }

    pub fn poll(&self, id: &str, max_bytes: usize) -> Result<PollReply, String> {
        if !(1..=65536).contains(&max_bytes) {
            return Err("Invalid output request size".into());
        }
        let session = self.get(id)?;
        let status = session
            .child
            .lock()
            .map_err(|_| "Process status unavailable")?
            .try_wait()
            .map_err(|e| e.to_string())?;
        if status.is_some() {
            // Closing HPCON lets the reader drain final bytes and see EOF.
            session.job.terminate();
            session
                .master
                .lock()
                .map_err(|_| "Terminal unavailable")?
                .take();
        }
        let mut output = session
            .output
            .lock()
            .map_err(|_| "Terminal output unavailable")?;
        let (bytes, dropped, drained) = output.drain(max_bytes);
        Ok(PollReply {
            bytes,
            dropped,
            exited: status.is_some() && drained,
            exit_code: status.map(|s| s.exit_code()),
            error: output.error.clone(),
        })
    }

    pub fn close(&self, id: &str) -> Result<(), String> {
        valid_id(id)?;
        let entry = self
            .sessions
            .lock()
            .map_err(|_| "Session registry unavailable")?
            .remove(id);
        if let Some(entry) = entry {
            entry.cancelled.store(true, Ordering::SeqCst);
            if let Some(session) = entry.session {
                session.stop();
            }
        }
        Ok(())
    }

    pub fn shutdown(&self) {
        self.stopping.store(true, Ordering::SeqCst);
        if let Ok(mut sessions) = self.sessions.lock() {
            for (_, entry) in sessions.drain() {
                entry.cancelled.store(true, Ordering::SeqCst);
                if let Some(session) = entry.session {
                    session.stop();
                }
            }
        }
    }
}

impl Drop for PtyManager {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_ids_and_dimensions() {
        assert!(valid_id("00000000-0000-4000-8000-000000000001").is_ok());
        assert!(valid_id("../anything").is_err());
        assert!(size(0, 24).is_err());
        assert!(size(80, 24).is_ok());
        assert!(size(501, 1).is_err());
    }

    #[test]
    fn close_is_idempotent_and_shutdown_clears_sessions() {
        let manager = PtyManager::default();
        assert!(manager
            .close("00000000-0000-4000-8000-000000000001")
            .is_ok());
        manager.shutdown();
        assert!(manager.get("00000000-0000-4000-8000-000000000001").is_err());
    }
}
