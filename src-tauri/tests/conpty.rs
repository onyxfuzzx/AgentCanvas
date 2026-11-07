#![cfg(windows)]

use agent_canvas_desktop::pty::PtyManager;
use std::{path::PathBuf, thread, time::{Duration, Instant}};
use windows_sys::Win32::{Foundation::{CloseHandle, WAIT_OBJECT_0}, System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_QUERY_LIMITED_INFORMATION}};

fn wait_output(manager: &PtyManager, id: &str, predicate: impl Fn(&str) -> bool) -> String {
    let deadline = Instant::now() + Duration::from_secs(20);
    let mut all = Vec::new();
    while Instant::now() < deadline {
        // PollReply is serializable: inspect protocol fields, not private internals.
        let reply = serde_json::to_value(manager.poll(id, 65536).expect("poll ConPTY")).unwrap();
        for byte in reply["bytes"].as_array().unwrap() { all.push(byte.as_u64().unwrap() as u8); }
        let text = String::from_utf8_lossy(&all);
        if predicate(&text) { return text.into_owned(); }
        thread::sleep(Duration::from_millis(25));
    }
    panic!("ConPTY output did not reach expected state: {}", String::from_utf8_lossy(&all));
}

#[test]
fn conpty_roundtrip_resize_and_close() {
    let manager = PtyManager::with_host(PathBuf::from(env!("CARGO_BIN_EXE_pty-host")));
    let id = "00000000-0000-4000-8000-000000000010";
    manager.spawn(id.into(), "cmd".into(), String::new(), 80, 24).expect("spawn cmd");
    manager.resize(id, 100, 32).expect("resize ConPTY");
    manager.write(id, b"echo __PTY_^READY__\r".to_vec()).expect("write command");
    wait_output(&manager, id, |text| text.contains("__PTY_READY__"));
    manager.close(id).expect("close session");
    manager.close(id).expect("idempotent close");
    assert!(manager.poll(id, 1024).is_err());
}

#[test]
fn closing_terminal_kills_a_descendant_process() {
    let manager = PtyManager::with_host(PathBuf::from(env!("CARGO_BIN_EXE_pty-host")));
    let id = "00000000-0000-4000-8000-000000000011";
    manager.spawn(id.into(), "powershell".into(), String::new(), 120, 30).expect("spawn PowerShell");
    manager.write(id, b"$p = Start-Process powershell.exe -NoNewWindow -ArgumentList '-NoProfile','-Command','Start-Sleep -Seconds 120' -PassThru; Write-Output ('CHILD:' + $p.Id)\r".to_vec()).unwrap();
    fn child_pid(text: &str) -> Option<u32> {
        text.split("CHILD:").skip(1).find_map(|part| {
            part.chars().take_while(char::is_ascii_digit).collect::<String>().parse().ok()
        })
    }
    let text = wait_output(&manager, id, |text| child_pid(text).is_some());
    let pid = child_pid(&text).unwrap();
    // SYNCHRONIZE access (0x00100000) permits waiting on the exact process handle.
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | 0x00100000, 0, pid) };
    assert!(!process.is_null(), "open descendant process");
    manager.close(id).expect("close parent terminal");
    let result = unsafe { WaitForSingleObject(process, 5000) };
    unsafe { CloseHandle(process); }
    assert_eq!(result, WAIT_OBJECT_0, "descendant must exit with the job");
}
