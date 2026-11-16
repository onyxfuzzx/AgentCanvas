fn main() {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let result = if args.len() == 4 && args[0] == "--data-dir" && args[2] == "--home" {
        agent_canvas_desktop::editor::Runtime::new(args[1].clone().into(), args[3].clone().into())
            .and_then(agent_canvas_desktop::editor::serve)
    } else {
        Err(
            "Usage: agentcanvas-editor --data-dir <absolute folder> --home <absolute folder>"
                .into(),
        )
    };
    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
