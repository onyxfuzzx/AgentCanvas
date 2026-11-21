//! Mixed provider transport/cooperative scheduler fixture. No external provider calls.
#![cfg(windows)]
use agent_canvas_desktop::{
    agents::{AgentLaunch, AgentSettings, Provider},
    areas,
    collaboration::Collaboration,
    ipc,
    orchestrator::{self, Control, Job, Limits, Permissions, Plan},
    pty::PtyManager,
    tasks::{Action, Status},
    workspace::Layout,
};
use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Arc,
    thread,
    time::{Duration, Instant},
};
fn helper(action: Value) -> Value {
    let started = Instant::now();
    let request_id = orchestrator::uuid().unwrap();
    loop {
        let mut child = Command::new(env!("CARGO_BIN_EXE_agentcanvas-peer"))
            .args(["task", &request_id, "--stdin"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(serde_json::to_string(&action).unwrap().as_bytes())
            .unwrap();
        let output = child.wait_with_output().unwrap();
        let reply: Value = serde_json::from_slice(&output.stdout).unwrap();
        // Fast CI workers can exhaust the real five-request burst while polling
        // and acknowledging a task. A rate-limit refusal happens before mutation;
        // wait for one token and retry the same request without weakening limits.
        if !output.status.success()
            && reply["ok"] == false
            && reply["error"]
                .as_str()
                .is_some_and(|error| error.starts_with("RATE_LIMIT:"))
            && started.elapsed() < Duration::from_secs(5)
        {
            thread::sleep(Duration::from_millis(500));
            continue;
        }
        assert!(
            output.status.success(),
            "Fixture helper action {} failed after {:?}: stdout={} stderr={}",
            action["type"],
            started.elapsed(),
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(
            reply["ok"], true,
            "Cooperative helper refused fixture action {}: {reply}",
            action["type"]
        );
        return reply["result"].clone();
    }
}
fn worker() {
    println!("__TEAM_FIXTURE_READY__");
    std::io::stdout().flush().unwrap();
    let mut done = std::collections::HashSet::new();
    let deadline = Instant::now() + Duration::from_secs(60);
    while Instant::now() < deadline {
        let inbox = helper(json!({"type":"inbox","after":null}));
        for t in inbox["tasks"].as_array().unwrap() {
            if t["attempt"]["state"] != "dispatched" {
                continue;
            }
            let id = t["id"].as_str().unwrap();
            let attempt = t["attempt"]["id"].as_str().unwrap();
            if !done.insert(attempt.to_owned()) {
                continue;
            }
            helper(json!({"type":"ack","id":id,"attemptId":attempt}));
            let marker = std::env::var("AGENTCANVAS_TEAM_GO").unwrap();
            while !Path::new(&marker).exists() && Instant::now() < deadline {
                thread::sleep(Duration::from_millis(20));
            }
            let task = helper(json!({"type":"get","id":id}));
            if task["reviewOf"].is_null() {
                fs::write("same.txt", format!("fixture task {id}\n")).unwrap();
                fs::create_dir_all("evidence").unwrap();
                fs::write(
                    "evidence/result.md",
                    format!("Intentional fixture result for {id}\n"),
                )
                .unwrap();
            }
            helper(
                json!({"type":"result","id":id,"attemptId":attempt,"summary":"Fixture change finished in its own checkout","artifacts":["evidence/result.md"]}),
            );
        }
        thread::sleep(Duration::from_millis(600));
    }
}
fn git(dir: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .current_dir(dir)
        .args([
            "-c",
            "core.hooksPath=NUL",
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@localhost",
        ])
        .args(args)
        .output()
        .unwrap();
    assert!(out.status.success(), "Fixture Git operation failed");
    String::from_utf8(out.stdout).unwrap().trim().into()
}
fn wait_review(service: &Collaboration, manager: &PtyManager, nodes: &[String], task: &str) {
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        for id in nodes {
            let poll = serde_json::to_value(manager.poll(id, 65536).unwrap()).unwrap();
            let bytes: Vec<u8> = poll["bytes"]
                .as_array()
                .unwrap()
                .iter()
                .map(|b| b.as_u64().unwrap() as u8)
                .collect();
            if !bytes.is_empty() {
                eprintln!(
                    "worker {id}: {}",
                    String::from_utf8_lossy(&bytes).escape_debug()
                );
            }
            for _ in 0..String::from_utf8_lossy(&bytes).matches("\x1b[6n").count() {
                manager.write(id, b"\x1b[1;1R".to_vec()).unwrap();
            }
        }
        service.team_tick();
        let b = service.task_snapshot("fixture").unwrap().board;
        if b.tasks
            .iter()
            .any(|t| t.id == task && t.state == Status::Review)
        {
            return;
        }
        assert!(
            Instant::now() < deadline,
            "Review fixture did not finish: {}",
            serde_json::to_string(&service.team_snapshot("fixture").unwrap()).unwrap()
        );
        thread::sleep(Duration::from_millis(100));
    }
}
fn main() {
    if std::env::var_os("AGENTCANVAS_TEAM_FIXTURE").is_some() {
        worker();
        return;
    }
    let root = std::env::current_dir()
        .unwrap()
        .join("target")
        .join(format!(
            "team-run-fixture-{}",
            orchestrator::uuid().unwrap()
        ));
    let repo = root.join("repository");
    let folder = root.join("workspace");
    fs::create_dir_all(&repo).unwrap();
    fs::create_dir_all(&folder).unwrap();
    git(&repo, &["init", "-b", "main"]);
    fs::write(repo.join("same.txt"), "base\n").unwrap();
    git(&repo, &["add", "."]);
    git(&repo, &["commit", "-m", "fixture base"]);
    let base = git(&repo, &["rev-parse", "HEAD"]);
    let ids = [
        orchestrator::uuid().unwrap(),
        orchestrator::uuid().unwrap(),
        orchestrator::uuid().unwrap(),
    ];
    let mut managed = Vec::new();
    for id in &ids {
        managed.push(
            areas::action(
                &folder,
                areas::Action::Create {
                    id: id.clone(),
                    name: "Fixture area".into(),
                    repository: repo.to_string_lossy().into_owned(),
                    base: base.clone(),
                },
            )
            .unwrap()
            .areas
            .into_iter()
            .find(|a| &a.id == id)
            .unwrap(),
        );
    }
    let nodes = [
        orchestrator::uuid().unwrap(),
        orchestrator::uuid().unwrap(),
        orchestrator::uuid().unwrap(),
    ];
    let providers = [Provider::Codex, Provider::Claude, Provider::Codex];
    let manager = Arc::new(PtyManager::with_host(PathBuf::from(env!(
        "CARGO_BIN_EXE_pty-host"
    ))));
    let service = Arc::new(Collaboration::new(manager.clone()).unwrap());
    let server = ipc::Server::start(service.clone()).unwrap();
    let layout:Layout=serde_json::from_value(json!({"nodes":nodes.iter().enumerate().map(|(i,id)|json!({"id":id,"kind":"terminal","title":format!("{} fixture",providers[i].id()),"shell":"cmd","cwd":managed[i].directory,"areaId":managed[i].id,"color":"#708f7c","x":i*700,"y":0,"width":660,"height":430,"z":i})).collect::<Vec<_>>(),"viewport":{"x":0,"y":0,"zoom":1},"settings":{"snapGrid":false},"edges":[]})).unwrap();
    service
        .configure("fixture", layout.clone(), &folder)
        .unwrap();
    for (i, id) in nodes.iter().enumerate() {
        let executable = root
            .join(format!("{}-{}", i, providers[i].id()))
            .join(format!("{}.exe", providers[i].id()));
        fs::create_dir_all(executable.parent().unwrap()).unwrap();
        fs::copy(std::env::current_exe().unwrap(), &executable).unwrap();
        let mut env = service.attach(id).unwrap();
        env.push(("AGENTCANVAS_TEAM_FIXTURE".into(), "1".into()));
        env.push((
            "AGENTCANVAS_TEAM_GO".into(),
            root.join("go").to_string_lossy().into_owned(),
        ));
        manager
            .spawn_agent(
                id.clone(),
                AgentLaunch {
                    name: format!("Fixture {i}"),
                    settings: AgentSettings {
                        provider: providers[i].clone(),
                        profile_name: "Fixture".into(),
                        role_name: "Builder".into(),
                        instructions: "Use only the cooperative fixture inbox".into(),
                        executable: Some(executable.to_string_lossy().into_owned()),
                    },
                },
                managed[i].directory.clone(),
                80,
                24,
                env,
            )
            .unwrap();
    }
    let task_ids = [
        orchestrator::uuid().unwrap(),
        orchestrator::uuid().unwrap(),
        orchestrator::uuid().unwrap(),
    ];
    let jobs = task_ids
        .iter()
        .enumerate()
        .map(|(i, id)| Job {
            id: id.clone(),
            title: format!("Fixture change {i}"),
            brief: "Modify same.txt only in the assigned checkout".into(),
            criteria: "Main checkout unchanged; selected artifact exists".into(),
            dependencies: if i == 2 {
                task_ids[..2].to_vec()
            } else {
                vec![]
            },
            agent: nodes[i].clone(),
            area: Some(managed[i].id.clone()),
            reviewer: None,
            review_task: None,
        })
        .collect();
    let control = |control| {
        let rev = service.task_snapshot("fixture").unwrap().board.revision;
        service.team_control("fixture", rev, control).unwrap()
    };
    control(Control::New {
        id: orchestrator::uuid().unwrap(),
        goal: "Mixed adapter end-to-end fixture".into(),
        coordinator: None,
        limits: Limits::default(),
        permissions: Permissions {
            dispatch: true,
            ..Permissions::default()
        },
    });
    control(Control::Adopt {
        plan: Plan {
            goal: "Mixed adapter fixture".into(),
            jobs,
            checks: vec![],
            repositories: vec![],
        },
    });
    control(Control::Start { automatic: true });
    service.team_tick();
    let first = service.task_snapshot("fixture").unwrap();
    assert_eq!(
        first
            .board
            .tasks
            .iter()
            .filter(|t| t.state == Status::Running)
            .count(),
        2
    );
    assert!(first.board.tasks[2].attempts.is_empty());
    fs::write(root.join("go"), "go").unwrap();
    let deadline = Instant::now() + Duration::from_secs(35);
    let mut cursor = [0usize; 3];
    let mut accepted = std::collections::HashSet::new();
    loop {
        for (i, id) in nodes.iter().enumerate() {
            let poll = serde_json::to_value(manager.poll(id, 65536).unwrap()).unwrap();
            let bytes: Vec<u8> = poll["bytes"]
                .as_array()
                .unwrap()
                .iter()
                .map(|b| b.as_u64().unwrap() as u8)
                .collect();
            let text = String::from_utf8_lossy(&bytes);
            if !bytes.is_empty() {
                eprintln!("worker {id}: {}", text.escape_debug());
            }
            let queries = text.matches("\x1b[6n").count();
            cursor[i] += queries;
            for _ in 0..queries {
                manager.write(id, b"\x1b[1;1R".to_vec()).unwrap();
            }
        }
        service.team_tick();
        let snapshot = service.task_snapshot("fixture").unwrap();
        for t in &snapshot.board.tasks {
            if t.state == Status::Review && accepted.insert(t.id.clone()) {
                let current = service.task_snapshot("fixture").unwrap();
                service
                    .task_action(
                        "fixture",
                        &orchestrator::uuid().unwrap(),
                        current.board.revision,
                        Action::Accept { id: t.id.clone() },
                    )
                    .unwrap();
            }
        }
        service.team_tick();
        if service
            .task_snapshot("fixture")
            .unwrap()
            .board
            .orchestration
            .as_ref()
            .unwrap()
            .state
            == "done"
        {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "Mixed adapter run did not complete: {}",
            serde_json::to_string(&service.team_snapshot("fixture").unwrap()).unwrap()
        );
        thread::sleep(Duration::from_millis(100));
    }
    assert_eq!(fs::read_to_string(repo.join("same.txt")).unwrap(), "base\n");
    for (i, a) in managed.iter().enumerate() {
        assert!(fs::read_to_string(Path::new(&a.directory).join("same.txt"))
            .unwrap()
            .contains(&task_ids[i]));
    }
    let board = service.task_snapshot("fixture").unwrap().board;
    assert_eq!(board.orchestration.unwrap().dispatched, 3);
    assert!(board.tasks.iter().all(|t| t.attempts.len() == 1));
    // A second, manual run exercises independent review and exact-commit acceptance.
    git(Path::new(&managed[0].directory), &["add", "."]);
    git(
        Path::new(&managed[0].directory),
        &["commit", "-m", "accept initial fixture changes"],
    );
    manager.close(&nodes[1]).unwrap();
    service.detach(&nodes[1]);
    let mut review_layout = layout;
    review_layout.nodes[1].cwd = Some(managed[0].directory.clone());
    review_layout.nodes[1].area_id = Some(managed[0].id.clone());
    service
        .configure("fixture", review_layout, &folder)
        .unwrap();
    let mut env = service.attach(&nodes[1]).unwrap();
    env.push(("AGENTCANVAS_TEAM_FIXTURE".into(), "1".into()));
    env.push((
        "AGENTCANVAS_TEAM_GO".into(),
        root.join("go").to_string_lossy().into_owned(),
    ));
    manager
        .spawn_agent(
            nodes[1].clone(),
            AgentLaunch {
                name: "Independent reviewer".into(),
                settings: AgentSettings {
                    provider: Provider::Claude,
                    profile_name: "Fixture".into(),
                    role_name: "Reviewer".into(),
                    instructions: "Read-only independent fixture review".into(),
                    executable: Some(
                        root.join("1-claude/claude.exe")
                            .to_string_lossy()
                            .into_owned(),
                    ),
                },
            },
            managed[0].directory.clone(),
            80,
            24,
            env,
        )
        .unwrap();
    let builder = orchestrator::uuid().unwrap();
    let reviewer = orchestrator::uuid().unwrap();
    control(Control::New {
        id: orchestrator::uuid().unwrap(),
        goal: "Independent review".into(),
        coordinator: None,
        limits: Limits {
            backoff_ms: 100,
            ..Limits::default()
        },
        permissions: Permissions {
            dispatch: true,
            ..Permissions::default()
        },
    });
    control(Control::Adopt {
        plan: Plan {
            goal: "Review exact commit".into(),
            jobs: vec![Job {
                id: builder.clone(),
                title: "Reviewed builder".into(),
                brief: "Write fixture change".into(),
                criteria: "Fresh independent review and check".into(),
                dependencies: vec![],
                agent: nodes[0].clone(),
                area: Some(managed[0].id.clone()),
                reviewer: Some(nodes[1].clone()),
                review_task: Some(reviewer.clone()),
            }],
            checks: vec![],
            repositories: vec![],
        },
    });
    control(Control::Start { automatic: false });
    control(Control::Dispatch {
        id: builder.clone(),
    });
    wait_review(&service, &manager, &nodes, &builder);
    let accept = |id: &str| {
        let rev = service.task_snapshot("fixture").unwrap().board.revision;
        service.task_action(
            "fixture",
            &orchestrator::uuid().unwrap(),
            rev,
            Action::Accept { id: id.into() },
        )
    };
    assert!(accept(&builder).is_err());
    git(Path::new(&managed[0].directory), &["add", "."]);
    git(
        Path::new(&managed[0].directory),
        &["commit", "-m", "builder result"],
    );
    control(Control::Dispatch {
        id: reviewer.clone(),
    });
    wait_review(&service, &manager, &nodes, &reviewer);
    // Moving the commit invalidates the reviewer result, even when its task succeeded.
    fs::write(
        Path::new(&managed[0].directory).join("changed-after-review.txt"),
        "explicit user edit\n",
    )
    .unwrap();
    git(Path::new(&managed[0].directory), &["add", "."]);
    git(
        Path::new(&managed[0].directory),
        &["commit", "-m", "invalidate old review"],
    );
    assert!(accept(&reviewer).is_err());
    let rev = service.task_snapshot("fixture").unwrap().board.revision;
    service
        .task_action(
            "fixture",
            &orchestrator::uuid().unwrap(),
            rev,
            Action::Reject {
                id: reviewer.clone(),
                reason: "Commit changed; obtain fresh review".into(),
            },
        )
        .unwrap();
    let rev = service.task_snapshot("fixture").unwrap().board.revision;
    service
        .task_action(
            "fixture",
            &orchestrator::uuid().unwrap(),
            rev,
            Action::Resolve {
                id: reviewer.clone(),
                outcome: Status::Ready,
            },
        )
        .unwrap();
    thread::sleep(Duration::from_millis(150));
    control(Control::Dispatch {
        id: reviewer.clone(),
    });
    wait_review(&service, &manager, &nodes, &reviewer);
    accept(&reviewer).unwrap();
    assert!(accept(&builder).is_err());
    for id in &nodes {
        service.begin_close(id).unwrap();
        manager.close(id).unwrap();
        service.detach(id);
    }
    manager.require_idle().unwrap();
    let head = git(Path::new(&managed[0].directory), &["rev-parse", "HEAD"]);
    areas::action(
        &folder,
        areas::Action::Check {
            id: managed[0].id.clone(),
            head,
            name: "Explicit fixture check".into(),
            state: "passed".into(),
            detail: "User fixture verified expected changes".into(),
        },
    )
    .unwrap();
    accept(&builder).unwrap();
    service.team_tick();
    assert_eq!(
        service
            .task_snapshot("fixture")
            .unwrap()
            .board
            .orchestration
            .unwrap()
            .state,
        "done"
    );
    assert_eq!(
        service
            .task_snapshot("fixture")
            .unwrap()
            .board
            .tasks
            .iter()
            .find(|t| t.id == reviewer)
            .unwrap()
            .attempts
            .len(),
        2
    );
    service.team_stop("fixture").unwrap();
    manager.shutdown();
    manager.require_idle().unwrap();
    drop(server);
    drop(service);
    drop(manager);
    let expected = std::env::current_dir().unwrap().join("target");
    if root.parent() == Some(expected.as_path())
        && root
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("team-run-fixture-")
    {
        let _ = fs::remove_dir_all(&root);
    }
    println!("Mixed Codex/Claude fixtures: two isolated concurrent changes, dependent user acceptance, cooperative helper results, stale-commit review refusal, fresh independent review, user check acceptance, exactly-once attempts and team stop passed; no provider calls.");
}
