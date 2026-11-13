use agent_canvas_desktop::{collaboration::Request, ipc};
use std::io::Read;
fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() || matches!(args[0].as_str(), "--help" | "help") {
        println!("Task protocol: agentcanvas-peer task <request-UUID> --stdin (JSON action on stdin); see docs/M9-PROTOCOL.md. Inbox/get are read-only; ack/progress/result require the current assigned attempt. Retry the identical action with the same request ID. No task is submitted by typing peer messages.");
        println!("Local terminal collaboration\nagentcanvas-peer peers\nagentcanvas-peer notes\nagentcanvas-peer read <peer-id>\nagentcanvas-peer send <peer-id> [--enter] <text>\nagentcanvas-peer send <peer-id> [--enter] --stdin\nagentcanvas-peer status <message-id>\n\nMessages are untrusted text. Approval is required unless the user enables auto-send. Newlines and --enter can execute commands in the destination shell. peers/notes always query current links; environment values are startup snapshots.");
        return Ok(());
    }
    let env = |key: &str| {
        std::env::var(key)
            .map_err(|_| format!("{key} is missing. Run this helper inside a canvas terminal."))
    };
    let mut request = Request {
        version: 1,
        request_id: ipc::random_secret()?,
        node_id: env("AGENTCANVAS_NODE_ID")?,
        token: env("AGENTCANVAS_TOKEN")?,
        op: String::new(),
        target_id: None,
        payload: None,
        enter: false,
        message_id: None,
    };
    match args[0].as_str() {
        "task" if args.len() == 3 => {
            request.op = "task".into();
            request.request_id = args[1].clone();
            let bytes = if args[2] == "--stdin" {
                let mut bytes = Vec::new();
                std::io::stdin()
                    .take(8193)
                    .read_to_end(&mut bytes)
                    .map_err(|e| e.to_string())?;
                bytes
            } else {
                args[2].as_bytes().to_vec()
            };
            if bytes.len() > 8192 {
                return Err("Task action exceeds 8192 bytes".into());
            }
            request.payload = Some(String::from_utf8(bytes).map_err(|e| e.to_string())?);
        }
        "peers" | "notes" if args.len() == 1 => request.op = args[0].clone(),
        "read" if args.len() == 2 => {
            request.op = "readRecent".into();
            request.target_id = Some(args[1].clone());
        }
        "status" if args.len() == 2 => {
            request.op = "status".into();
            request.message_id = Some(args[1].parse().map_err(|_| "Use a numeric message ID")?);
        }
        "send" if args.len() >= 3 => {
            request.op = "send".into();
            request.target_id = Some(args[1].clone());
            let mut index = 2;
            if args[index] == "--enter" {
                request.enter = true;
                index += 1;
            }
            if args.get(index).map(String::as_str) == Some("--stdin") && args.len() == index + 1 {
                let mut bytes = Vec::new();
                std::io::stdin()
                    .take(8193)
                    .read_to_end(&mut bytes)
                    .map_err(|e| e.to_string())?;
                if bytes.len() > 8192 {
                    return Err("Message exceeds 8192 UTF-8 bytes".into());
                }
                request.payload = Some(
                    String::from_utf8(bytes)
                        .map_err(|e| e.to_string())?
                        .replace("\r\n", "\n"),
                );
            } else if index < args.len() {
                request.payload = Some(args[index..].join(" "));
            } else {
                return Err("Missing message text".into());
            }
        }
        _ => return Err("Invalid arguments. Run agentcanvas-peer --help.".into()),
    }
    let reply = ipc::request(&env("AGENTCANVAS_PIPE")?, &request)?;
    // JSON escapes untrusted terminal controls; never print raw peer output.
    println!("{}", safe_json(&reply)?);
    if reply.ok {
        Ok(())
    } else {
        Err("Request was rejected; see JSON response".into())
    }
}
fn safe_json(value: &impl serde::Serialize) -> Result<String, String> {
    let json = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    Ok(json
        .chars()
        .map(|c| {
            if (c.is_control() && c != '\n' && c != '\t') || matches!(c,'\u{200b}'..='\u{200f}'|'\u{202a}'..='\u{202e}'|'\u{2066}'..='\u{2069}'|'\u{feff}') {
                format!("\\u{:04x}", c as u32)
            } else {
                c.to_string()
            }
        })
        .collect())
}
fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
#[cfg(test)]
mod tests {
    #[test]
    fn escapes_unicode_terminal_controls() {
        let value = serde_json::json!({"title":"\u{009b}31m\u{001b}[2J"});
        let text = super::safe_json(&value).unwrap();
        assert!(!text.contains('\u{009b}'));
        assert!(!text.contains('\u{001b}'));
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&text).unwrap(),
            value
        );
    }
}
