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
