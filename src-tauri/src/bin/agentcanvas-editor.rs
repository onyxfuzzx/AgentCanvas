fn run() -> Result<i32, String> {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    #[cfg(windows)]
    if args.len() == 3 && args[0] == "--wait-editor" {
        let pid = args[1]
            .to_str()
            .and_then(|s| s.parse::<u32>().ok())
            .filter(|p| *p > 0)
            .ok_or("Invalid editor PID")?;
        let session = args[2].to_str().ok_or("Invalid editor session")?;
        if !valid_session(session) {
            return Err("Invalid editor session".into());
        }
        agent_canvas_desktop::process_tree::wait_editor(pid, session)?;
        return Ok(0);
    }
    let worker = args.first().is_some_and(|a| a == "--worker");
    let a = if worker { &args[1..] } else { &args[..] };
    if a.len() == 6 && a[0] == "--session" && a[2] == "--data-dir" && a[4] == "--home" {
        let session = a[1]
            .to_str()
            .filter(|s| valid_session(s))
            .ok_or("Invalid editor session")?;
        if worker {
            let job =
                std::env::var("AGENTCANVAS_EDITOR_JOB").map_err(|_| "Missing editor ownership")?;
            agent_canvas_desktop::process_tree::join(&job)?;
            agent_canvas_desktop::editor::Runtime::new(a[3].clone().into(), a[5].clone().into())
                .and_then(agent_canvas_desktop::editor::serve)?;
            return Ok(0);
        }
        let job = agent_canvas_desktop::process_tree::Job::new(&format!("editor-{session}"))?;
        let mut command =
            std::process::Command::new(std::env::current_exe().map_err(|e| e.to_string())?);
        command
            .arg("--worker")
            .args(a)
            .env("AGENTCANVAS_EDITOR_JOB", &job.name);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let mut child = command.spawn().map_err(|e| e.to_string())?;
        let status = child.wait().map_err(|e| e.to_string())?;
        job.terminate();
        #[cfg(windows)]
        job.wait_empty(std::time::Duration::from_secs(5))?;
        return Ok(status.code().unwrap_or(1));
    }
    // Keep direct CLI callers compatible. Extension sessions use the supervisor.
    if !worker && a.len() == 4 && a[0] == "--data-dir" && a[2] == "--home" {
        agent_canvas_desktop::editor::Runtime::new(a[1].clone().into(), a[3].clone().into())
            .and_then(agent_canvas_desktop::editor::serve)?;
        return Ok(0);
    }
    Err("Usage: agentcanvas-editor [--session <UUID>] --data-dir <absolute folder> --home <absolute folder>".into())
}
fn valid_session(s: &str) -> bool {
    s.len() == 36
        && s.bytes().enumerate().all(|(i, c)| {
            if [8, 13, 18, 23].contains(&i) {
                c == b'-'
            } else {
                c.is_ascii_hexdigit()
            }
        })
}
fn main() {
    match run() {
        Ok(code) => std::process::exit(code),
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
