#![cfg(windows)]
use agent_canvas_desktop::{
    collaboration::{Collaboration, Request},
    ipc,
    pty::PtyManager,
    workspace::Layout,
};
use serde_json::{json, Value};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::PathBuf,
    process::{Command, Stdio},
    sync::Arc,
    thread,
    time::{Duration, Instant},
};
const A: &str = "00000000-0000-4000-8000-000000000001";
const B: &str = "00000000-0000-4000-8000-000000000002";
const N: &str = "00000000-0000-4000-8000-000000000003";
const E: &str = "00000000-0000-4000-8000-000000000004";
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = std::env::current_dir()
            .unwrap()
            .join("target")
            .join(format!(
                "collaboration-test-{}-{}",
                std::process::id(),
                ipc::random_secret().unwrap()
            ));
        fs::create_dir_all(path.join("notes")).unwrap();
        Self(fs::canonicalize(path).unwrap())
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let base = fs::canonicalize(std::env::current_dir().unwrap().join("target")).unwrap();
        if self.0.parent() == Some(base.as_path())
            && self
                .0
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("collaboration-test-")
        {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
}
fn layout(policy: &str) -> Layout {
    serde_json::from_value(json!({"nodes":[
      {"id":A,"kind":"terminal","title":"Source","color":"#708f7c","x":0,"y":0,"width":660,"height":430,"z":1,"shell":"cmd","cwd":"C:\\"},
      {"id":B,"kind":"terminal","title":"Peer","color":"#708f7c","x":800,"y":0,"width":660,"height":430,"z":2,"shell":"cmd","cwd":"C:\\"}],
      "viewport":{"x":0,"y":0,"zoom":1},"settings":{"snapGrid":false},"edges":[{"id":E,"source":A,"target":B,"kind":"agent","policy":policy}]})).unwrap()
}
fn token(env: &[(String, String)]) -> String {
    env.iter()
        .find(|(key, _)| key == "AGENTCANVAS_TOKEN")
        .unwrap()
        .1
        .clone()
}
fn request(token: &str, op: &str) -> Request {
    Request {
        version: 1,
        request_id: "test".into(),
        node_id: A.into(),
        token: token.into(),
        op: op.into(),
        target_id: Some(B.into()),
        payload: Some("test message".into()),
        enter: false,
        message_id: None,
    }
}
fn snapshot(service: &Collaboration) -> Value {
    serde_json::to_value(service.snapshot(0).unwrap().unwrap()).unwrap()
}
#[test]
fn capabilities_revocation_rate_limits_and_pending_approvals_are_bounded() {
    let fixture = Fixture::new();
    let service = Collaboration::new(Arc::new(PtyManager::default())).unwrap();
    let mut graph = layout("approval");
    service
        .configure("workspace", graph.clone(), &fixture.0)
        .unwrap();
    let source = token(&service.attach(A).unwrap());
    service.attach(B).unwrap();
    assert!(!service.handle(request("wrong", "send")).ok);
    let first = service.handle(request(&source, "send"));
    assert!(first.ok);
    assert_eq!(first.result["status"], "pending");
    let id = first.result["id"].as_u64().unwrap();
    service.decide(id, false).unwrap();
    assert_eq!(snapshot(&service)["logs"][0]["status"], "rejected");
    for _ in 0..4 {
        assert!(service.handle(request(&source, "send")).ok);
    }
    assert!(service
        .handle(request(&source, "send"))
        .error
        .unwrap()
        .contains("RATE_LIMIT"));
    for _ in 0..300 {
        service.handle(request(&source, "send"));
    }
    let state = snapshot(&service);
    assert!(state["logs"].as_array().unwrap().len() <= 200);
    assert_eq!(
        state["logs"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|l| l["status"] == "pending")
            .count(),
        4
    );
    let pending = state["logs"]
        .as_array()
        .unwrap()
        .iter()
        .find(|l| l["status"] == "pending")
        .unwrap()["id"]
        .as_u64()
        .unwrap();
    service.detach(B);
    assert!(service.decide(pending, true).is_err());
    service.attach(B).unwrap();
    graph.edges.clear();
    service.configure("workspace", graph, &fixture.0).unwrap();
    assert!(!service.handle(request(&source, "send")).ok);
    let replacement = token(&service.attach(A).unwrap());
    assert_ne!(source, replacement);
    assert!(!service.handle(request(&source, "peers")).ok);
}
#[test]
fn unsafe_payloads_and_invalid_edges_are_rejected_without_losing_graph() {
    let fixture = Fixture::new();
    let service = Collaboration::new(Arc::new(PtyManager::default())).unwrap();
    let graph = layout("approval");
    service
        .configure("workspace", graph.clone(), &fixture.0)
        .unwrap();
    let secret = token(&service.attach(A).unwrap());
    service.attach(B).unwrap();
    for text in ["\x1b[31m", "\x03", "\0", ""] {
        let mut r = request(&secret, "send");
        r.payload = Some(text.into());
        assert!(!service.handle(r).ok);
    }
    let mut r = request(&secret, "send");
    r.payload = Some("x".repeat(8193));
    assert!(!service.handle(r).ok);
    let mut invalid = graph.clone();
    invalid.edges[0].target = "missing".into();
    assert!(service.configure("workspace", invalid, &fixture.0).is_err());
    assert!(service.handle(request(&secret, "send")).ok);
    let mut other = graph;
    other.edges[0].policy = "auto".into();
    service.configure("workspace", other, &fixture.0).unwrap();
    assert!(snapshot(&service)["logs"]
        .as_array()
        .unwrap()
        .iter()
        .all(|l| l["status"] != "pending"));
    service
        .configure("another-workspace", layout("approval"), &fixture.0)
        .unwrap();
    assert!(!service.handle(request(&secret, "peers")).ok);
}
fn wait_output(manager: &PtyManager, id: &str, expected: &str) {
    let deadline = Instant::now() + Duration::from_secs(15);
    let mut all = String::new();
    let mut answered = 0;
    while Instant::now() < deadline {
        let reply = serde_json::to_value(manager.poll(id, 65536).unwrap()).unwrap();
        let bytes: Vec<_> = reply["bytes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|b| b.as_u64().unwrap() as u8)
            .collect();
        all.push_str(&String::from_utf8_lossy(&bytes));
        let queries = all.matches("\x1b[6n").count();
        for _ in answered..queries {
            manager.write(id, b"\x1b[1;1R".to_vec()).unwrap();
        }
        answered = queries;
        if all.contains(expected) {
            return;
        }
        thread::sleep(Duration::from_millis(20));
    }
    panic!("Terminal did not produce expected marker: {expected}");
}
fn helper(fixture: &Fixture, env: &[(String, String)], node: &str, args: &[&str]) -> Value {
    let output = fixture.0.join("helper.json");
    let error = fixture.0.join("helper-error.txt");
    let status = Command::new(env!("CARGO_BIN_EXE_agentcanvas-peer"))
        .args(args)
        .envs(env.iter().cloned())
        .env("AGENTCANVAS_NODE_ID", node)
        .stdin(Stdio::null())
        .stdout(File::create(&output).unwrap())
        .stderr(File::create(&error).unwrap())
        .status()
        .expect("run real peer helper");
    assert!(
        status.success(),
        "helper failed: {} {}",
        fs::read_to_string(error).unwrap(),
        fs::read_to_string(&output).unwrap()
    );
    serde_json::from_slice(&fs::read(output).unwrap()).unwrap()
}
#[test]
fn real_pipe_helper_approval_auto_send_recent_output_and_live_shared_notes() {
    let fixture = Fixture::new();
    let manager = Arc::new(PtyManager::with_host(PathBuf::from(env!(
        "CARGO_BIN_EXE_pty-host"
    ))));
    let service = Arc::new(Collaboration::new(manager.clone()).unwrap());
    let mut graph = layout("approval");
    service
        .configure("workspace", graph.clone(), &fixture.0)
        .unwrap();
    let server = ipc::Server::start(service.clone()).unwrap();
    let env_a = service.attach(A).unwrap();
    let env_b = service.attach(B).unwrap();
    manager
        .spawn_with_env(
            A.into(),
            "cmd".into(),
            fixture.0.to_string_lossy().into_owned(),
            100,
            24,
            env_a.clone(),
        )
        .unwrap();
    manager
        .spawn_with_env(
            B.into(),
            "cmd".into(),
            fixture.0.to_string_lossy().into_owned(),
            100,
            24,
            env_b,
        )
        .unwrap();
    wait_output(&manager, A, ">");
    wait_output(&manager, B, ">");
    let peers = helper(&fixture, &env_a, A, &["peers"]);
    assert_eq!(peers["result"][0]["id"], B);
    let sent = helper(
        &fixture,
        &env_a,
        A,
        &["send", B, "--enter", "echo __M5_^APPROVED__"],
    );
    let id = sent["result"]["id"].as_u64().unwrap();
    assert_eq!(sent["result"]["status"], "pending");
    assert!(!manager.recent(B, 8192).unwrap().contains("__M5_APPROVED__"));
    service.decide(id, true).unwrap();
    wait_output(&manager, B, "__M5_APPROVED__");
    let recent = helper(&fixture, &env_a, A, &["read", B]);
    assert!(recent["result"]["text"]
        .as_str()
        .unwrap()
        .contains("__M5_APPROVED__"));
    assert!(!recent["result"]["text"].as_str().unwrap().contains('\x1b'));
    graph.edges[0].policy = "auto".into();
    service
        .configure("workspace", graph.clone(), &fixture.0)
        .unwrap();
    assert_eq!(
        helper(
            &fixture,
            &env_a,
            A,
            &["send", B, "--enter", "echo __M5_^AUTO__"]
        )["result"]["status"],
        "queued"
    );
    wait_output(&manager, B, "__M5_AUTO__");
    let path = format!("notes/{N}.md");
    fs::write(fixture.0.join(&path), "shared context").unwrap();
    let mut note = graph.nodes[0].clone();
    note.id = N.into();
    note.kind = "note".into();
    note.shell = None;
    note.cwd = None;
    note.relative_path = Some(path);
    graph.nodes.push(note);
    graph.edges.push(serde_json::from_value(json!({"id":"00000000-0000-4000-8000-000000000005","source":N,"target":A,"kind":"memory","policy":"approval"})).unwrap());
    service.configure("workspace", graph, &fixture.0).unwrap();
    assert_eq!(
        env_a
            .iter()
            .find(|(k, _)| k == "AGENTCANVAS_NOTE_PATHS")
            .unwrap()
            .1,
        "[]"
    );
    let notes = helper(&fixture, &env_a, A, &["notes"]);
    let shared = PathBuf::from(notes["result"][0]["path"].as_str().unwrap());
    assert_eq!(fs::read_to_string(&shared).unwrap(), "shared context");
    fs::write(&shared, "agent updated memory").unwrap();
    assert_eq!(fs::read_to_string(shared).unwrap(), "agent updated memory");
    manager.shutdown();
    drop(server);
}
#[test]
fn pipe_rejects_oversized_frames_and_cancels_silent_clients_on_shutdown() {
    let service = Arc::new(Collaboration::new(Arc::new(PtyManager::default())).unwrap());
    let server = ipc::Server::start(service.clone()).unwrap();
    let mut client = OpenOptions::new()
        .read(true)
        .write(true)
        .open(&service.pipe)
        .unwrap();
    client.write_all(&u32::MAX.to_le_bytes()).unwrap();
    let mut byte = [0];
    assert!(matches!(client.read(&mut byte), Ok(0) | Err(_)));
    drop(client);
    let silent = OpenOptions::new()
        .read(true)
        .write(true)
        .open(&service.pipe)
        .unwrap();
    let start = Instant::now();
    drop(server);
    assert!(start.elapsed() < Duration::from_secs(3));
    drop(silent);
}
