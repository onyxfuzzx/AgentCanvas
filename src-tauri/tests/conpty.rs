#![cfg(windows)]

use agent_canvas_desktop::pty::PtyManager;
use std::{
    path::PathBuf,
    thread,
    time::{Duration, Instant},
};
use windows_sys::Win32::{
    Foundation::{CloseHandle, WAIT_OBJECT_0},
    System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_QUERY_LIMITED_INFORMATION},
};

fn wait_output(manager: &PtyManager, id: &str, predicate: impl Fn(&str) -> bool) -> String {
    let deadline = Instant::now() + Duration::from_secs(20);
    let mut all = Vec::new();
    let mut answered_cursor_queries = 0;
    while Instant::now() < deadline {
        // PollReply is serializable: inspect protocol fields, not private internals.
        let reply = serde_json::to_value(manager.poll(id, 65536).expect("poll ConPTY")).unwrap();
        for byte in reply["bytes"].as_array().unwrap() {
            all.push(byte.as_u64().unwrap() as u8);
        }
        let text = String::from_utf8_lossy(&all);
        // ConPTY inherits the cursor by querying its terminal. A real xterm
        // answers automatically; this byte-level harness must do the same.
        let cursor_queries = text.matches("\x1b[6n").count();
        for _ in answered_cursor_queries..cursor_queries {
            manager
                .write(id, b"\x1b[1;1R".to_vec())
                .expect("reply to cursor query");
        }
        answered_cursor_queries = cursor_queries;
        if predicate(&text) {
            return text.into_owned();
        }
        thread::sleep(Duration::from_millis(25));
    }
    panic!(
        "ConPTY output did not reach expected state: {}",
        String::from_utf8_lossy(&all)
    );
}

#[test]
fn conpty_roundtrip_resize_and_close() {
    let manager = PtyManager::with_host(PathBuf::from(env!("CARGO_BIN_EXE_pty-host")));
    let id = "00000000-0000-4000-8000-000000000010";
    manager
        .spawn(
            id.into(),
            "cmd".into(),
            std::env::current_dir()
                .unwrap()
                .to_string_lossy()
                .into_owned(),
            80,
            24,
        )
        .expect("spawn cmd");
    wait_output(&manager, id, |text| text.contains('>'));
    manager.resize(id, 100, 32).expect("resize ConPTY");
    manager
        .write(id, b"echo __PTY_^READY__\r".to_vec())
        .expect("write command");
    wait_output(&manager, id, |text| text.contains("__PTY_READY__"));
    manager.close(id).expect("close session");
    manager.close(id).expect("idempotent close");
    assert!(manager.poll(id, 1024).is_err());
}

#[test]
fn closing_terminal_kills_a_descendant_process() {
    let manager = PtyManager::with_host(PathBuf::from(env!("CARGO_BIN_EXE_pty-host")));
    let id = "00000000-0000-4000-8000-000000000011";
    manager
        .spawn(id.into(), "powershell".into(), String::new(), 120, 30)
        .expect("spawn PowerShell");
    manager.write(id, b"$p = Start-Process powershell.exe -NoNewWindow -ArgumentList '-NoProfile','-Command','Start-Sleep -Seconds 120' -PassThru; Write-Output ('CHILD:' + $p.Id)\r".to_vec()).unwrap();
    fn child_pid(text: &str) -> Option<u32> {
        text.split("CHILD:").skip(1).find_map(|part| {
            part.chars()
                .take_while(char::is_ascii_digit)
                .collect::<String>()
                .parse()
                .ok()
        })
    }
    let text = wait_output(&manager, id, |text| child_pid(text).is_some());
    let pid = child_pid(&text).unwrap();
    // SYNCHRONIZE access (0x00100000) permits waiting on the exact process handle.
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | 0x00100000, 0, pid) };
    assert!(!process.is_null(), "open descendant process");
    manager.close(id).expect("close parent terminal");
    let result = unsafe { WaitForSingleObject(process, 5000) };
    unsafe {
        CloseHandle(process);
    }
    assert_eq!(result, WAIT_OBJECT_0, "descendant must exit with the job");
}

#[test]
fn twenty_live_terminals_roundtrip_and_shutdown() {
    let manager = PtyManager::with_host(PathBuf::from(env!("CARGO_BIN_EXE_pty-host")));
    let cwd = std::env::current_dir()
        .unwrap()
        .to_string_lossy()
        .into_owned();
    let started = Instant::now();
    let mut ids = Vec::new();
    for index in 0..20 {
        let id = format!("00000000-0000-4000-8000-{:012}", 100 + index);
        manager
            .spawn(id.clone(), "cmd".into(), cwd.clone(), 80, 24)
            .expect("spawn within capacity");
        wait_output(&manager, &id, |text| text.contains('>'));
        manager
            .write(&id, b"echo __CAPACITY_^READY__\r".to_vec())
            .unwrap();
        wait_output(&manager, &id, |text| text.contains("__CAPACITY_READY__"));
        ids.push(id);
    }
    assert!(manager
        .spawn(
            "00000000-0000-4000-8000-000000000999".into(),
            "cmd".into(),
            cwd,
            80,
            24
        )
        .is_err());
    println!(
        "Twenty simultaneous ConPTY roundtrips completed in {:?}",
        started.elapsed()
    );
    manager.shutdown();
    for id in ids {
        assert!(manager.poll(&id, 1024).is_err());
    }
}

#[test]
#[ignore = "requires unrestricted MSYS2 signal-pipe access and an installed Git Bash"]
fn git_bash_roundtrip_preserves_selected_directory_when_installed() {
    if agent_canvas_desktop::shell::executable("git-bash").is_err() {
        println!("Git Bash is not installed; preset roundtrip skipped");
        return;
    }
    let manager = PtyManager::with_host(PathBuf::from(env!("CARGO_BIN_EXE_pty-host")));
    let cwd = std::env::current_dir().unwrap();
    let id = "00000000-0000-4000-8000-000000000020";
    manager
        .spawn(
            id.into(),
            "git-bash".into(),
            cwd.to_string_lossy().into_owned(),
            120,
            30,
        )
        .unwrap();
    manager.write(id, b"printf '\\137\\137GIT_READY\\137\\137\\n'; pwd; printf '\\137\\137GIT_DONE\\137\\137\\n'\r".to_vec()).unwrap();
    let output = wait_output(&manager, id, |text| text.contains("__GIT_DONE__"));
    assert!(output.contains("__GIT_READY__"));
    let expected = cwd.to_string_lossy().replace('\\', "/");
    assert!(
        output.contains(&expected[2..]),
        "Git Bash must retain the selected working directory"
    );
    manager.close(id).unwrap();
}
