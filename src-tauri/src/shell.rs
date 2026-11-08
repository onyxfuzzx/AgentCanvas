use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
pub struct ShellInfo {
    pub id: &'static str,
    pub label: &'static str,
    pub available: bool,
}

pub fn executable(shell: &str) -> Result<PathBuf, String> {
    let system =
        PathBuf::from(std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into()));
    let path = match shell {
        "powershell" => system
            .join("System32")
            .join("WindowsPowerShell")
            .join("v1.0")
            .join("powershell.exe"),
        "cmd" => system.join("System32").join("cmd.exe"),
        "wsl" => system.join("System32").join("wsl.exe"),
        "git-bash" => {
            let candidates = [
                std::env::var_os("ProgramFiles")
                    .map(PathBuf::from)
                    .map(|p| p.join("Git").join("bin").join("bash.exe")),
                std::env::var_os("LOCALAPPDATA")
                    .map(PathBuf::from)
                    .map(|p| p.join("Programs").join("Git").join("bin").join("bash.exe")),
            ];
            candidates
                .into_iter()
                .flatten()
                .find(|p| p.is_file())
                .ok_or("Git Bash is not installed in a supported location")?
        }
        _ => return Err("Unknown shell preset".into()),
    };
    if !path.is_file() {
        return Err(format!("Shell is not installed: {}", path.display()));
    }
    Ok(path)
}

pub fn directory(cwd: &str) -> Result<PathBuf, String> {
    if cwd.len() > 32768 || cwd.contains('\0') {
        return Err("Invalid working directory".into());
    }
    let path = if cwd.trim().is_empty() {
        std::env::var_os("USERPROFILE")
            .map(PathBuf::from)
            .ok_or("User home is unavailable")?
    } else {
        PathBuf::from(cwd)
    };
    if !path.is_absolute() || !path.is_dir() {
        return Err("Working directory must be an existing absolute folder".into());
    }
    Ok(path)
}

pub fn presets() -> Vec<ShellInfo> {
    [
        ("powershell", "PowerShell"),
        ("cmd", "Command Prompt"),
        ("wsl", "WSL"),
        ("git-bash", "Git Bash"),
    ]
    .into_iter()
    .map(|(id, label)| ShellInfo {
        id,
        label,
        available: executable(id).is_ok(),
    })
    .collect()
}

// The trusted console host joins its job before starting user-controlled code.
// No user-provided command strings are evaluated by this host.
pub fn host(shell: &str, cwd: &Path) -> Result<i32, String> {
    let job = std::env::var("AGENTCANVAS_JOB").map_err(|_| "Missing job ownership")?;
    crate::process_tree::join(&job)?;
    let mut command = std::process::Command::new(executable(shell)?);
    command.current_dir(cwd).env_remove("AGENTCANVAS_JOB");
    match shell {
        "powershell" => {
            command.args(["-NoLogo"]);
        }
        "cmd" => {
            command.args(["/D"]);
        }
        "wsl" => {
            command.arg("--cd").arg(cwd);
        }
        "git-bash" => {
            command.args(["--login", "-i"]).env("CHERE_INVOKING", "1");
        }
        _ => return Err("Unknown shell".into()),
    }
    let status = command.status().map_err(|e| e.to_string())?;
    Ok(status.code().unwrap_or(1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_shell_and_bad_directory() {
        assert!(executable("powershell -command injected").is_err());
        assert!(directory("relative/path").is_err());
        assert!(directory("bad\0directory").is_err());
    }
}
