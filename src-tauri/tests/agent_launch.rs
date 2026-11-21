//! This test executable doubles as a native CLI fixture. It never calls a provider.
#![cfg(windows)]
use agent_canvas_desktop::{
    agents::{AgentLaunch, AgentSettings, Provider},
    pty::PtyManager,
};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    thread,
    time::{Duration, Instant},
};
use windows_sys::Win32::{
    Foundation::{CloseHandle, WAIT_OBJECT_0},
    System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_QUERY_LIMITED_INFORMATION},
};
fn main() {
    if let Ok(file) = std::env::var("AGENTCANVAS_FIXTURE_REPORT") {
        let report = serde_json::json!({ "pid":std::process::id(), "args":std::env::args().skip(1).collect::<Vec<_>>(), "cwd":std::env::current_dir().unwrap(), "name":std::env::var("AGENTCANVAS_AGENT_NAME").unwrap(), "role":std::env::var("AGENTCANVAS_AGENT_ROLE").unwrap(), "provider":std::env::var("AGENTCANVAS_AGENT_PROVIDER").unwrap(), "node":std::env::var("AGENTCANVAS_NODE_ID").unwrap(), "pipe":std::env::var("AGENTCANVAS_PIPE").unwrap(), "token":std::env::var("AGENTCANVAS_TOKEN").unwrap(), "jobRemoved":std::env::var_os("AGENTCANVAS_JOB").is_none() });
        fs::write(file, serde_json::to_vec(&report).unwrap()).unwrap();
        println!("__AGENT_FIXTURE_READY__");
        std::io::stdout().flush().unwrap();
        thread::sleep(Duration::from_secs(120));
        return;
    }
    let root = std::env::current_dir()
        .unwrap()
        .join("target")
        .join(format!("agent-launch-test-{}", std::process::id()));
    fs::create_dir_all(&root).unwrap();
    let cwd = root.join("work space & 日本語");
    fs::create_dir_all(&cwd).unwrap();
    for (index, provider) in [Provider::Codex, Provider::Antigravity, Provider::Claude]
        .into_iter()
        .enumerate()
    {
        let executable = root.join(provider.executable_name());
        fs::copy(std::env::current_exe().unwrap(), &executable).unwrap();
        let report_file = root.join(format!("report-{index}.json"));
        let id = format!("00000000-0000-4000-8000-{:012}", 8100 + index);
        let launch = AgentLaunch {
            name: "API agent & reviewer".into(),
            settings: AgentSettings {
                provider: provider.clone(),
                profile_name: "Fixture preset".into(),
                role_name: "Role with spaces".into(),
                instructions:
                    "Quotes: \"value\". Path: C:\\a b\\.\n日本語 & $(whoami) | echo inert".into(),
                executable: Some(executable.to_string_lossy().into_owned()),
            },
        };
        let manager = PtyManager::with_host(PathBuf::from(env!("CARGO_BIN_EXE_pty-host")));
        manager
            .spawn_agent(
                id.clone(),
                launch.clone(),
                cwd.to_string_lossy().into_owned(),
                100,
                30,
                vec![
                    (
                        "AGENTCANVAS_FIXTURE_REPORT".into(),
                        report_file.to_string_lossy().into_owned(),
                    ),
                    ("AGENTCANVAS_PIPE".into(), "fixture-pipe".into()),
                    ("AGENTCANVAS_TOKEN".into(), "fixture-token".into()),
                ],
            )
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(20);
        let mut bytes = Vec::new();
        let mut answered = 0;
        loop {
            let reply = serde_json::to_value(manager.poll(&id, 65536).unwrap()).unwrap();
            bytes.extend(
                reply["bytes"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|b| b.as_u64().unwrap() as u8),
            );
            let text = String::from_utf8_lossy(&bytes);
            let queries = text.matches("\x1b[6n").count();
            for _ in answered..queries {
                manager.write(&id, b"\x1b[1;1R".to_vec()).unwrap();
            }
            answered = queries;
            if text.contains("__AGENT_FIXTURE_READY__") {
                break;
            }
            assert!(
                Instant::now() < deadline,
                "CLI fixture did not launch: {text}"
            );
            thread::sleep(Duration::from_millis(25));
        }
        let report: serde_json::Value =
            serde_json::from_slice(&fs::read(&report_file).unwrap()).unwrap();
        assert_eq!(
            report["args"],
            serde_json::to_value(launch.arguments(&id).unwrap()).unwrap()
        );
        assert_eq!(report["cwd"], serde_json::to_value(&cwd).unwrap());
        assert_eq!(report["name"], launch.name);
        assert_eq!(report["role"], launch.settings.role_name);
        assert_eq!(report["provider"], provider.id());
        assert_eq!(report["node"], id);
        assert_eq!(report["pipe"], "fixture-pipe");
        assert_eq!(report["token"], "fixture-token");
        assert_eq!(report["jobRemoved"], true);
        let pid = report["pid"].as_u64().unwrap() as u32;
        let process =
            unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | 0x00100000, 0, pid) };
        assert!(!process.is_null());
        if index == 0 {
            manager.close(&id).unwrap();
        } else {
            manager.shutdown();
        }
        let result = unsafe { WaitForSingleObject(process, 5000) };
        unsafe {
            CloseHandle(process);
        }
        assert_eq!(
            result, WAIT_OBJECT_0,
            "agent must die with its owning terminal/application"
        );
        println!("{}: exact argv, cwd, identity, inherited peer environment, ConPTY output and process cleanup passed",provider.id());
    }
    assert!(
        root.parent() == Some(std::env::current_dir().unwrap().join("target").as_path())
            && root
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("agent-launch-test-")
    );
    fs::remove_dir_all(root).unwrap();
}
