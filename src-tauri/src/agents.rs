//! Installed CLI launch adapters and a local, versioned preset library.
use crate::atomic_file::{self, Lock};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

const MAX_FILE: usize = 512 * 1024;
pub const MAX_INSTRUCTIONS: usize = 4096;
#[cfg(test)]
#[path = "agents_tests.rs"]
mod tests;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Codex,
    Claude,
}
impl Provider {
    pub fn id(&self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude => "claude",
        }
    }
}
fn name_valid(value: &str) -> bool {
    !value.trim().is_empty() && value.chars().count() <= 80 && !value.chars().any(char::is_control)
}
fn instructions_valid(value: &str) -> bool {
    value.len() <= MAX_INSTRUCTIONS
        && !value
            .chars()
            .any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t'))
}
fn executable_valid(provider: &Provider, value: &str) -> bool {
    let path = Path::new(value);
    value.len() <= 4096
        && !value.contains('\0')
        && path.is_absolute()
        && path.file_name().is_some_and(|n| {
            n.to_string_lossy()
                .eq_ignore_ascii_case(&format!("{}.exe", provider.id()))
        })
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentSettings {
    pub provider: Provider,
    pub profile_name: String,
    pub role_name: String,
    pub instructions: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub executable: Option<String>,
}
impl AgentSettings {
    pub fn validate(&self) -> Result<(), String> {
        if !name_valid(&self.profile_name)
            || !name_valid(&self.role_name)
            || !instructions_valid(&self.instructions)
            || self
                .executable
                .as_ref()
                .is_some_and(|v| !executable_valid(&self.provider, v))
        {
            return Err("Invalid agent settings: names are 1–80 characters, instructions at most 4096 UTF-8 bytes, and overrides must be an absolute codex.exe or claude.exe path".into());
        }
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AgentLaunch {
    pub name: String,
    pub settings: AgentSettings,
}
impl AgentLaunch {
    pub fn validate(&self) -> Result<(), String> {
        if !name_valid(&self.name) {
            return Err("Agent name must be 1–80 characters without controls".into());
        }
        self.settings.validate()
    }
    pub fn identity(&self, id: &str) -> String {
        format!("Agent name: {}\nRole: {}\nCanvas node ID: {}\nRespect the project's instructions and your CLI's approval settings. Wait for the user to assign work. {}\nRole instructions:\n{}", self.name, self.settings.role_name, id, crate::tasks::AGENT_GUIDANCE, self.settings.instructions)
    }
    pub fn arguments(&self, id: &str) -> Result<Vec<String>, String> {
        self.validate()?;
        if !crate::workspace::id_valid(id) {
            return Err("Invalid agent node ID".into());
        }
        let identity = self.identity(id);
        Ok(match self.settings.provider {
            Provider::Codex => vec![
                "--no-daemon".into(),
                "--no-alt-screen".into(),
                "--config".into(),
                format!(
                    "developer_instructions={}",
                    serde_json::to_string(&identity).map_err(|e| e.to_string())?
                ),
            ],
            Provider::Claude => vec!["--append-system-prompt".into(), identity],
        })
    }
}

pub fn resolve(provider: &Provider, override_path: Option<&str>) -> Result<PathBuf, String> {
    if let Some(value) = override_path {
        if !executable_valid(provider, value) {
            return Err("Choose an absolute native CLI executable path".into());
        }
        let path = PathBuf::from(value);
        return path
            .is_file()
            .then_some(path)
            .ok_or_else(|| "Configured agent executable is missing".into());
    }
    let home = std::env::var_os("USERPROFILE").map(PathBuf::from);
    let mut folders: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|v| {
            std::env::split_paths(&v)
                .filter(|p| p.is_absolute())
                .collect()
        })
        .unwrap_or_default();
    if let Some(home) = &home {
        folders.push(home.join(".local/bin"));
        folders.push(home.join("AppData/Roaming/npm"));
    }
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        folders.push(PathBuf::from(local).join("Programs"));
    }
    let current = std::env::current_dir().ok();
    let mut candidates = Vec::new();
    for folder in folders {
        if current.as_ref().is_some_and(|cwd| cwd == &folder) {
            continue;
        }
        candidates.push(folder.join(format!("{}.exe", provider.id())));
        if *provider == Provider::Codex {
            let (arch, package) = if std::env::consts::ARCH == "aarch64" {
                ("aarch64-pc-windows-msvc", "codex-win32-arm64")
            } else {
                ("x86_64-pc-windows-msvc", "codex-win32-x64")
            };
            for base in [
                folder.join(format!(
                    "node_modules/@openai/codex/node_modules/@openai/{package}/vendor/{arch}"
                )),
                folder.join(format!("node_modules/@openai/codex/vendor/{arch}")),
            ] {
                candidates.push(base.join("bin/codex.exe"));
                candidates.push(base.join("codex/codex.exe"));
            }
        }
    }
    candidates.into_iter().find(|p| p.is_file()).ok_or_else(|| format!("{} native CLI was not found. Install it separately or set its executable path in Agent presets.", provider.id()))
}
#[derive(Serialize)]
pub struct Availability {
    provider: Provider,
    available: bool,
    path: Option<String>,
    error: Option<String>,
    capabilities: TaskCapabilities,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskCapabilities {
    submission: &'static str,
    readiness: &'static str,
    progress: &'static str,
    cancellation: &'static str,
    resume: &'static str,
    version: &'static str,
}
impl Default for TaskCapabilities {
    fn default() -> Self {
        Self {
            submission: "cooperative inbox; explicit user briefing required",
            readiness: "agent acknowledgement",
            progress: "cooperative helper reports",
            cancellation: "cooperative acknowledgement or stop terminal",
            resume: "unsupported",
            version: "unknown; executable detection only",
        }
    }
}
pub fn providers() -> Vec<Availability> {
    [Provider::Codex, Provider::Claude]
        .into_iter()
        .map(|provider| match resolve(&provider, None) {
            Ok(path) => Availability {
                provider,
                available: true,
                path: Some(crate::workspace::display(&path)),
                error: None,
                capabilities: TaskCapabilities::default(),
            },
            Err(error) => Availability {
                provider,
                available: false,
                path: None,
                error: Some(error),
                capabilities: TaskCapabilities::default(),
            },
        })
        .collect()
}

pub fn host(launch: AgentLaunch, cwd: &Path) -> Result<i32, String> {
    launch.validate()?;
    let job = std::env::var("AGENTCANVAS_JOB").map_err(|_| "Missing job ownership")?;
    crate::process_tree::join(&job)?;
    let id = std::env::var("AGENTCANVAS_NODE_ID").map_err(|_| "Missing agent node ID")?;
    let program = resolve(
        &launch.settings.provider,
        launch.settings.executable.as_deref(),
    )?;
    let arguments = launch.arguments(&id)?;
    let cwd = crate::shell::directory(&crate::workspace::display(cwd))?;
    let status = std::process::Command::new(program)
        .args(arguments)
        .current_dir(cwd)
        .env_remove("AGENTCANVAS_JOB")
        .env("AGENTCANVAS_AGENT_NAME", &launch.name)
        .env("AGENTCANVAS_AGENT_PROVIDER", launch.settings.provider.id())
        .env("AGENTCANVAS_AGENT_ROLE", &launch.settings.role_name)
        .status()
        .map_err(|e| format!("Could not launch agent: {e}"))?;
    Ok(status.code().unwrap_or(1))
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Role {
    pub id: String,
    pub name: String,
    pub instructions: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub provider: Provider,
    pub role_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub executable: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Library {
    pub version: u32,
    pub revision: u64,
    pub roles: Vec<Role>,
    pub profiles: Vec<Profile>,
}
impl Default for Library {
    fn default() -> Self {
        let roles: Vec<Role> = [
            ("00000000-0000-4000-8000-000000008001", "Builder", "Implement assigned changes, follow project conventions, and report changes with the checks you actually ran."),
            ("00000000-0000-4000-8000-000000008002", "Reviewer", "Review assigned changes for correctness and regressions. Report findings with file locations. Do not edit files unless the user asks."),
            ("00000000-0000-4000-8000-000000008003", "Tester", "Investigate assigned behavior and run relevant checks. Report observed results and limitations. Ask before modifying implementation files."),
        ].into_iter().map(|(id,name,instructions)| Role { id:id.into(),name:name.into(),instructions:instructions.into() }).collect();
        let profiles = [
            (
                "00000000-0000-4000-8000-000000008011",
                "Codex Builder",
                Provider::Codex,
                roles[0].id.clone(),
            ),
            (
                "00000000-0000-4000-8000-000000008012",
                "Claude Reviewer",
                Provider::Claude,
                roles[1].id.clone(),
            ),
            (
                "00000000-0000-4000-8000-000000008013",
                "Codex Tester",
                Provider::Codex,
                roles[2].id.clone(),
            ),
        ]
        .into_iter()
        .map(|(id, name, provider, role_id)| Profile {
            id: id.into(),
            name: name.into(),
            provider,
            role_id,
            executable: None,
        })
        .collect();
        Self {
            version: 1,
            revision: 0,
            roles,
            profiles,
        }
    }
}
impl Library {
    pub fn validate(&self) -> Result<(), String> {
        if self.version != 1 || self.roles.len() > 32 || self.profiles.len() > 32 {
            return Err("Unsupported agent library or more than 32 roles/presets".into());
        }
        let mut ids = HashSet::new();
        for r in &self.roles {
            if !crate::workspace::id_valid(&r.id)
                || !ids.insert(&r.id)
                || !name_valid(&r.name)
                || !instructions_valid(&r.instructions)
            {
                return Err("Invalid or duplicate role".into());
            }
        }
        for p in &self.profiles {
            if !crate::workspace::id_valid(&p.id)
                || !ids.insert(&p.id)
                || !name_valid(&p.name)
                || !self.roles.iter().any(|r| r.id == p.role_id)
                || p.executable
                    .as_ref()
                    .is_some_and(|v| !executable_valid(&p.provider, v))
            {
                return Err("Invalid preset or missing role".into());
            }
        }
        Ok(())
    }
}
#[derive(Serialize)]
pub struct LibraryReply {
    pub library: Library,
    pub fingerprint: Option<String>,
    pub recovered: bool,
}
fn read(path: &Path) -> Result<Option<Vec<u8>>, String> {
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    if file.metadata().map_err(|e| e.to_string())?.len() > MAX_FILE as u64 {
        return Err("Agent library exceeds 512 KiB".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_FILE as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > MAX_FILE {
        return Err("Agent library exceeds 512 KiB".into());
    }
    Ok(Some(bytes))
}
fn decode(bytes: &[u8]) -> Result<Library, String> {
    let value: Library = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
    value.validate()?;
    Ok(value)
}
fn fingerprint(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
// The loaded reply, preserved primary bytes and last-good bytes for the next backup.
type DiskLibrary = (LibraryReply, Option<Vec<u8>>, Vec<u8>);
fn load(base: &Path) -> Result<DiskLibrary, String> {
    let primary = read(&base.join("agents.json"))?;
    let stamp = primary.as_deref().map(fingerprint);
    if let Some(bytes) = &primary {
        match decode(bytes) {
            Ok(library) => {
                return Ok((
                    LibraryReply {
                        library,
                        fingerprint: stamp,
                        recovered: false,
                    },
                    primary.clone(),
                    bytes.clone(),
                ))
            }
            Err(error) if serde_json::from_slice::<serde_json::Value>(bytes).is_ok() => {
                return Err(format!("Agent library was not changed: {error}"))
            }
            _ => {}
        }
    }
    if let Some(bytes) = read(&base.join("agents.json.bak"))? {
        let library =
            decode(&bytes).map_err(|e| format!("Agent library backup is unreadable: {e}"))?;
        return Ok((
            LibraryReply {
                library,
                fingerprint: stamp,
                recovered: true,
            },
            primary,
            bytes,
        ));
    }
    if primary.is_some() {
        return Err("Agent library is corrupt and has no usable backup; original preserved".into());
    }
    let library = Library::default();
    let good = serde_json::to_vec_pretty(&library).map_err(|e| e.to_string())?;
    Ok((
        LibraryReply {
            library,
            fingerprint: None,
            recovered: false,
        },
        None,
        good,
    ))
}
pub fn catalog(base: &Path) -> Result<LibraryReply, String> {
    load(base).map(|(reply, _, _)| reply)
}
pub fn save(
    base: &Path,
    expected: Option<String>,
    mut library: Library,
) -> Result<LibraryReply, String> {
    library.validate()?;
    if !base.is_absolute()
        || expected
            .as_ref()
            .is_some_and(|v| v.len() != 64 || !v.bytes().all(|c| c.is_ascii_hexdigit()))
    {
        return Err("Invalid agent library save request".into());
    }
    fs::create_dir_all(base).map_err(|e| e.to_string())?;
    let _lock = Lock::acquire(&base.join(".agents.lock"))?;
    let (current, original, good) = load(base)?;
    if current.fingerprint != expected || current.library.revision != library.revision {
        return Err("Agent presets changed on disk. Reload before saving; your draft remains in the editor.".into());
    }
    library.revision = library
        .revision
        .checked_add(1)
        .ok_or("Agent library revision overflow")?;
    let bytes = serde_json::to_vec_pretty(&library).map_err(|e| e.to_string())?;
    if bytes.len() > MAX_FILE {
        return Err("Agent library exceeds 512 KiB".into());
    }
    if current.recovered {
        if let Some(original) = original {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_nanos();
            let mut archive = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(base.join(format!(
                    "agents.corrupt-{}-{stamp}.json",
                    std::process::id()
                )))
                .map_err(|e| e.to_string())?;
            archive
                .write_all(&original)
                .and_then(|_| archive.sync_all())
                .map_err(|e| e.to_string())?;
        }
    }
    atomic_file::write(&base.join("agents.json.bak"), &good)?;
    atomic_file::write(&base.join("agents.json"), &bytes)?;
    Ok(LibraryReply {
        library,
        fingerprint: Some(fingerprint(&bytes)),
        recovered: false,
    })
}
