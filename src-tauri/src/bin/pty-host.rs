// Console subsystem is intentional: stdio must be inherited from ConPTY.
fn main() {
    let result = (|| {
        let mut args = std::env::args_os().skip(1);
        let preset = args
            .next()
            .and_then(|s| s.into_string().ok())
            .ok_or("Missing shell")?;
        let cwd = args
            .next()
            .map(std::path::PathBuf::from)
            .ok_or("Missing directory")?;
        if preset == "--agent" {
            let payload = args
                .next()
                .and_then(|s| s.into_string().ok())
                .ok_or("Missing agent launch settings")?;
            if payload.len() > 20000 || args.next().is_some() {
                return Err("Invalid agent launch payload".into());
            }
            let launch = serde_json::from_str(&payload)
                .map_err(|e| format!("Invalid agent launch settings: {e}"))?;
            return agent_canvas_desktop::agents::host(launch, &cwd);
        }
        if args.next().is_some() {
            return Err("Unexpected argument".to_owned());
        }
        agent_canvas_desktop::shell::host(&preset, &cwd)
    })();
    match result {
        Ok(code) => std::process::exit(code),
        Err(error) => {
            eprintln!("PTY host: {error}");
            std::process::exit(1);
        }
    }
}
