use super::*;
#[test]
fn setup_inspection_is_filesystem_only_and_rejects_wrappers_and_missing_paths() {
    let f = Fixture::new();
    let valid = f.0.join("codex.exe");
    fs::write(&valid, b"fixture file, not an executable program").unwrap();
    let result = inspect(Provider::Codex, Some(crate::workspace::display(&valid)));
    assert!(result.available);
    assert_eq!(
        result.capabilities.version,
        "unknown; executable detection only"
    );
    for path in [
        "codex.exe".to_owned(),
        crate::workspace::display(&f.0.join("codex.cmd")),
        crate::workspace::display(&f.0.join("missing/codex.exe")),
        crate::workspace::display(&f.0),
    ] {
        let result = inspect(Provider::Codex, Some(path));
        assert!(!result.available);
        assert!(result.path.is_none());
        assert!(result.error.is_some());
    }
}
use std::sync::atomic::{AtomicU64, Ordering};
static NEXT: AtomicU64 = AtomicU64::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = std::env::current_dir()
            .unwrap()
            .join("target")
            .join(format!(
                "agent-library-test-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let target = std::env::current_dir().unwrap().join("target");
        if self.0.parent() == Some(target.as_path())
            && self
                .0
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("agent-library-test-")
        {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
}
fn launch(provider: Provider) -> AgentLaunch {
    AgentLaunch { name: "API builder & reviewer".into(), settings: AgentSettings { provider, profile_name: "Local preset".into(), role_name: "Builder".into(), instructions: "Read \"quoted\" paths, C:\\repo\\ and 日本語.\nDo not execute: $(whoami) & echo surprise | more".into(), executable: None } }
}
#[test]
fn cli_arguments_keep_identity_as_data_without_a_task_or_safety_override() {
    let id = "00000000-0000-4000-8000-000000008100";
    let codex = launch(Provider::Codex);
    let args = codex.arguments(id).unwrap();
    assert_eq!(&args[..3], ["--no-daemon", "--no-alt-screen", "--config"]);
    let decoded: String =
        serde_json::from_str(args[3].strip_prefix("developer_instructions=").unwrap()).unwrap();
    assert_eq!(decoded, codex.identity(id));
    let claude = launch(Provider::Claude);
    assert_eq!(
        claude.arguments(id).unwrap(),
        vec!["--append-system-prompt".to_string(), claude.identity(id)]
    );
    assert!(codex.arguments("bad-id").is_err());
}
#[test]
fn validation_bounds_roles_and_rejects_shell_wrappers_and_mixed_providers() {
    let mut value = launch(Provider::Codex);
    value.settings.instructions = "é".repeat(2049);
    assert!(value.validate().is_err());
    value.settings.instructions = "\x1b[0m".into();
    assert!(value.validate().is_err());
    value.settings.instructions = String::new();
    value.name = "name\nsecond".into();
    assert!(value.validate().is_err());
    value.name = "Builder".into();
    for path in [
        "codex.exe",
        "C:\\tools\\codex.cmd",
        "C:\\tools\\powershell.exe",
        "C:\\tools\\claude.exe",
    ] {
        value.settings.executable = Some(path.into());
        assert!(value.validate().is_err(), "{path}");
    }
    let mut library = Library::default();
    library.profiles[0].role_id = "missing".into();
    assert!(library.validate().is_err());
    library = Library::default();
    library.roles[0].id = library.profiles[0].id.clone();
    assert!(library.validate().is_err());
}
#[test]
fn library_saves_atomically_and_refuses_stale_and_external_edits() {
    let f = Fixture::new();
    let initial = catalog(&f.0).unwrap();
    assert_eq!(initial.library.revision, 0);
    assert!(!f.0.join("agents.json").exists());
    let first = save(&f.0, None, initial.library.clone()).unwrap();
    assert_eq!(first.library.revision, 1);
    assert_eq!(first.fingerprint.as_ref().unwrap().len(), 64);
    assert!(save(&f.0, None, initial.library).is_err());
    let mut edited = first.library.clone();
    edited.roles[0].instructions = "Updated safely".into();
    let second = save(&f.0, first.fingerprint, edited).unwrap();
    assert_eq!(second.library.revision, 2);
    assert_eq!(
        decode(&fs::read(f.0.join("agents.json.bak")).unwrap())
            .unwrap()
            .revision,
        1
    );
    let mut external = second.library.clone();
    external.roles[0].name = "External edit".into();
    let external_bytes = serde_json::to_vec_pretty(&external).unwrap();
    fs::write(f.0.join("agents.json"), &external_bytes).unwrap();
    assert!(save(&f.0, second.fingerprint, second.library).is_err());
    assert_eq!(fs::read(f.0.join("agents.json")).unwrap(), external_bytes);
}
#[test]
fn recovery_archives_corrupt_original_and_preserves_unsupported_schema() {
    let f = Fixture::new();
    let initial = catalog(&f.0).unwrap();
    let first = save(&f.0, None, initial.library).unwrap();
    save(&f.0, first.fingerprint, first.library).unwrap();
    let broken = b"{truncated";
    fs::write(f.0.join("agents.json"), broken).unwrap();
    let recovered = catalog(&f.0).unwrap();
    assert!(recovered.recovered);
    save(&f.0, recovered.fingerprint, recovered.library).unwrap();
    let archived = fs::read_dir(&f.0)
        .unwrap()
        .filter_map(Result::ok)
        .find(|p| {
            p.file_name()
                .to_string_lossy()
                .starts_with("agents.corrupt-")
        })
        .unwrap();
    assert_eq!(fs::read(archived.path()).unwrap(), broken);
    let mut unsupported = serde_json::to_value(Library::default()).unwrap();
    unsupported["version"] = 2.into();
    let bytes = serde_json::to_vec(&unsupported).unwrap();
    fs::write(f.0.join("agents.json"), &bytes).unwrap();
    assert!(catalog(&f.0).is_err());
    assert_eq!(fs::read(f.0.join("agents.json")).unwrap(), bytes);
}
