//! A single explicitly declared check, with argument vectors and interruptible process ownership.
use std::{
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
#[derive(Default)]
pub struct CheckRunner {
    active: Mutex<Option<String>>,
    cancelled: AtomicBool,
}
impl CheckRunner {
    pub fn active(&self) -> Option<String> {
        self.active.lock().ok().and_then(|s| s.clone())
    }
    pub fn stop(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }
    pub fn run(
        &self,
        spec: &crate::orchestrator::Check,
        cwd: &str,
        authorize: impl FnOnce() -> Result<(), String>,
    ) -> Result<String, String> {
        {
            let mut active = self
                .active
                .lock()
                .map_err(|_| "Check runtime unavailable")?;
            if active.is_some() {
                return Err("Another declared check is still running".into());
            }
            self.cancelled.store(false, Ordering::SeqCst);
            *active = Some(spec.id.clone());
        }
        let result = (|| {
            authorize()?;
            crate::areas::plain(std::path::Path::new(&spec.program))?;
            if self.cancelled.load(Ordering::SeqCst) {
                return Err("Check cancelled before launch".into());
            }
            let mut command = Command::new(&spec.program);
            command
                .args(&spec.args)
                .current_dir(cwd)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            // Do not pass application capability tokens into declared tools.
            for (key, _) in std::env::vars_os() {
                if key.to_string_lossy().starts_with("AGENTCANVAS_") {
                    command.env_remove(key);
                }
            }
            #[cfg(windows)]
            let job = crate::process_tree::Job::new("declared-check")?;
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                command.creation_flags(0x08000000);
            }
            let mut child = command.spawn().map_err(|e| e.to_string())?;
            #[cfg(windows)]
            if let Err(e) = job.attach_child(&child) {
                let _ = child.kill();
                let _ = child.wait();
                return Err(e);
            }
            let started = Instant::now();
            loop {
                if self.cancelled.load(Ordering::SeqCst)
                    || started.elapsed() >= Duration::from_millis(spec.timeout_ms)
                {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err("Check cancelled or elapsed-time limit reached; no passing evidence recorded".into());
                }
                if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                    return Ok(if status.success() { "passed" } else { "failed" }.into());
                }
                std::thread::sleep(Duration::from_millis(25));
            }
        })();
        if let Ok(mut active) = self.active.lock() {
            *active = None;
        }
        result
    }
}
