//! Local Git worktrees. Durable intent precedes mutations; uncertain operations never replay.
use crate::{
    atomic_file::{self, Lock},
    workspace::{display, id_valid},
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::{Duration, Instant},
};

const LIMIT: u64 = 1024 * 1024;
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Check {
    pub head: String,
    pub name: String,
    pub state: String,
    pub detail: String,
}
#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Approval {
    pub head: String,
    pub target_head: String,
    pub target: String,
    pub tree: String,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Operation {
    pub kind: String,
    pub state: String,
    pub detail: String,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Area {
    pub id: String,
    pub name: String,
    pub repository: String,
    pub common: String,
    pub directory: String,
    pub branch: String,
    pub base: String,
    pub checks: Vec<Check>,
    pub findings: String,
    pub approval: Option<Approval>,
    pub operation: Operation,
    pub integrated: Option<String>,
    pub removed: bool,
}
#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Catalog {
    pub version: u32,
    pub areas: Vec<Area>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Review {
    pub head: String,
    pub status: String,
    pub files: String,
    pub diff: String,
    pub commits: String,
    pub checks: Vec<Check>,
    pub findings: String,
    pub approval: Option<Approval>,
}
#[derive(Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Action {
    Create {
        id: String,
        name: String,
        repository: String,
        base: String,
    },
    Check {
        id: String,
        head: String,
        name: String,
        state: String,
        detail: String,
    },
    Findings {
        id: String,
        head: String,
        text: String,
    },
    Approve {
        id: String,
        preview: Approval,
    },
    Integrate {
        id: String,
        preview: Approval,
    },
    Cleanup {
        id: String,
    },
    Reconcile {
        id: String,
    },
}

fn diagnostic(value: String) -> String {
    value
        .chars()
        .filter(|c| !c.is_control() || *c == '\n' || *c == '\t')
        .take(2000)
        .collect()
}
fn text(value: &str, max: usize) -> Result<(), String> {
    if value.len() > max
        || value
            .chars()
            .any(|c| c.is_control() && c != '\n' && c != '\t')
    {
        return Err("Invalid text or size limit".into());
    }
    Ok(())
}
fn oid(s: &str) -> bool {
    [40, 64].contains(&s.len()) && s.bytes().all(|b| b.is_ascii_hexdigit())
}
// Reject junctions/symlinks at every existing component, including metadata and parents.
pub fn plain(path: &Path) -> Result<(), String> {
    for p in path.ancestors() {
        match fs::symlink_metadata(p) {
            Ok(m) => {
                #[cfg(windows)]
                {
                    use std::os::windows::fs::MetadataExt;
                    if m.file_attributes() & 0x400 != 0 {
                        return Err(
                            "Reparse paths are not allowed for managed Git operations".into()
                        );
                    }
                }
                if m.file_type().is_symlink() {
                    return Err("Symbolic paths are not allowed".into());
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}
fn canonical(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("Choose an absolute path".into());
    }
    plain(path)?;
    fs::canonicalize(path).map_err(|e| e.to_string())
}

/// Argument vectors only. No hooks, external diff/textconv, prompts or inherited Git overrides.
fn git_result(dir: &Path, args: &[&str]) -> Result<(bool, String), String> {
    git_scoped(dir, args, true)
}
fn git_scoped(dir: &Path, args: &[&str], isolated: bool) -> Result<(bool, String), String> {
    let mut command = Command::new("git");
    for (key, _) in std::env::vars_os() {
        if key.to_string_lossy().starts_with("GIT_") {
            command.env_remove(key);
        }
    }
    command
        .current_dir(dir)
        .args([
            "--no-pager",
            "-c",
            if cfg!(windows) {
                "core.hooksPath=NUL"
            } else {
                "core.hooksPath=/dev/null"
            },
            "-c",
            "commit.gpgSign=false",
            "-c",
            "core.fsmonitor=false",
            "-c",
            "diff.external=",
            "-c",
            "core.quotePath=true",
            "-c",
            "core.longpaths=true",
            "-c",
            "user.name=AgentCanvas",
            "-c",
            "user.email=agentcanvas@localhost",
        ])
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if isolated {
        // Inherit only EOL conversion from trusted system/user settings. Ignoring it
        // makes a normal Windows CRLF checkout appear dirty after a successful commit.
        if args.first() != Some(&"config") {
            for (key, allowed) in [
                ("core.autocrlf", &["true", "false", "input"][..]),
                ("core.eol", &["lf", "crlf", "native"][..]),
            ] {
                let (exists, value) = git_scoped(dir, &["config", "--get", key], false)?;
                if exists {
                    if !allowed.contains(&value.as_str()) {
                        return Err(format!("Invalid Git EOL setting: {key}"));
                    }
                    command.args(["-c", &format!("{key}={value}")]);
                }
            }
        }
        command.env("GIT_CONFIG_NOSYSTEM", "1").env(
            "GIT_CONFIG_GLOBAL",
            if cfg!(windows) { "NUL" } else { "/dev/null" },
        );
    }
    command.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    #[cfg(windows)]
    let job = crate::process_tree::Job::new("git")?;
    let mut child = command
        .spawn()
        .map_err(|e| format!("Cannot start Git: {e}"))?;
    #[cfg(windows)]
    if let Err(e) = job.attach_child(&child) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(format!("Cannot own Git process: {e}"));
    }
    let out = child.stdout.take().ok_or("Git stdout unavailable")?;
    let err = child.stderr.take().ok_or("Git stderr unavailable")?;
    let read = |stream: Box<dyn Read + Send>| {
        std::thread::spawn(move || {
            let mut bytes = Vec::new();
            stream
                .take(LIMIT + 1)
                .read_to_end(&mut bytes)
                .map(|_| bytes)
        })
    };
    let stdout = read(Box::new(out));
    let stderr = read(Box::new(err));
    let started = Instant::now();
    let status = loop {
        if let Some(s) = child.try_wait().map_err(|e| e.to_string())? {
            break s;
        }
        if started.elapsed() > Duration::from_secs(30) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Git timed out; inspect the operation before reconciling".into());
        }
        std::thread::sleep(Duration::from_millis(10));
    };
    let out = stdout
        .join()
        .map_err(|_| "Git reader failed")?
        .map_err(|e| e.to_string())?;
    let err = stderr
        .join()
        .map_err(|_| "Git reader failed")?
        .map_err(|e| e.to_string())?;
    if out.len() > LIMIT as usize || err.len() > LIMIT as usize {
        return Err("Git output exceeds 1 MiB; narrow the change before review".into());
    }
    Ok((
        status.success(),
        String::from_utf8_lossy(if status.success() { &out } else { &err })
            .trim_end()
            .to_owned(),
    ))
}
fn git(dir: &Path, args: &[&str]) -> Result<String, String> {
    let (ok, s) = git_result(dir, args)?;
    if ok {
        Ok(s)
    } else {
        Err(format!("Git refused: {s}"))
    }
}
fn head(dir: &Path) -> Result<String, String> {
    let h = git(dir, &["rev-parse", "--verify", "HEAD^{commit}"])?;
    if !oid(&h) {
        return Err("Invalid commit".into());
    }
    Ok(h)
}
fn clean(dir: &Path, ignored: bool) -> Result<(), String> {
    let mut args = vec!["status", "--porcelain=v1", "--untracked-files=all"];
    if ignored {
        args.push("--ignored");
    }
    if !git(dir, &args)?.is_empty() {
        return Err(
            "Checkout contains changed, untracked or ignored files; preserve or move them first"
                .into(),
        );
    }
    for state in [
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-merge",
        "rebase-apply",
        "index.lock",
    ] {
        let p = git(
            dir,
            &["rev-parse", "--path-format=absolute", "--git-path", state],
        )?;
        if Path::new(&p).exists() {
            return Err("Finish the existing Git operation first".into());
        }
    }
    Ok(())
}
fn repo(path: &Path) -> Result<(PathBuf, String), String> {
    let dir = canonical(path)?;
    plain(&dir.join(".git"))?;
    canonical(Path::new(&git(&dir, &["rev-parse", "--absolute-git-dir"])?))?;
    let top = canonical(Path::new(&git(&dir, &["rev-parse", "--show-toplevel"])?))?;
    if dir != top {
        return Err("Choose the repository root".into());
    }
    let common = canonical(Path::new(&git(
        &dir,
        &["rev-parse", "--path-format=absolute", "--git-common-dir"],
    )?))?;
    // Git attributes can invoke arbitrary smudge filters and merge drivers. Managed operations
    // intentionally require ordinary Git behavior; bootstrap scripts have an empty allowlist.
    if git_result(
        &dir,
        &[
            "config",
            "--get-regexp",
            r"^(filter\..*\.(clean|smudge|process)|merge\..*\.driver)$",
        ],
    )?
    .0
    {
        return Err("Custom Git checkout filters or merge drivers require manual execution outside managed areas".into());
    }
    Ok((dir, display(&common)))
}
fn root(folder: &Path) -> PathBuf {
    PathBuf::from(display(folder)).join("task-areas")
}
fn load(folder: &Path) -> Result<Catalog, String> {
    let path = folder.join("areas.json");
    plain(&path)?;
    if let Ok(metadata) = fs::metadata(&path) {
        if metadata.len() > 2 * LIMIT {
            return Err("Area catalog too large".into());
        }
        if let Ok(bytes) = fs::read(&path) {
            if let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                if value.get("version").and_then(|v| v.as_u64()) != Some(1)
                    || serde_json::from_value::<Catalog>(value).is_err()
                {
                    return Err(
                        "Unsupported area catalog schema; original and backup left untouched"
                            .into(),
                    );
                }
            }
        }
    }
    let read = |p: &Path| -> Result<Catalog, String> {
        plain(p)?;
        let m = fs::metadata(p).map_err(|e| e.to_string())?;
        if m.len() > 2 * LIMIT {
            return Err("Area catalog too large".into());
        }
        let value: Catalog = serde_json::from_slice(&fs::read(p).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        if value.version != 1 || value.areas.len() > 128 {
            return Err("Unsupported area catalog".into());
        }
        let mut ids = std::collections::HashSet::new();
        for a in &value.areas {
            if !id_valid(&a.id)
                || !ids.insert(&a.id)
                || a.branch != format!("agentcanvas/{}", a.id)
                || !oid(&a.base)
                || a.checks.len() > 128
            {
                return Err("Invalid area metadata".into());
            }
            if Path::new(&a.directory) != root(folder).join(&a.id) {
                return Err("Area path differs from its managed location".into());
            }
            text(&a.name, 120)?;
            text(&a.findings, 4200)?;
            text(&a.operation.detail, LIMIT as usize)?;
            if !Path::new(&a.repository).is_absolute()
                || !Path::new(&a.common).is_absolute()
                || !["create", "integrate", "cleanup"].contains(&a.operation.kind.as_str())
                || !["pending", "complete", "uncertain"].contains(&a.operation.state.as_str())
                || a.integrated.as_deref().is_some_and(|h| !oid(h))
            {
                return Err("Invalid area ownership or journal state".into());
            }
            let mut names = std::collections::HashSet::new();
            for c in &a.checks {
                text(&c.name, 120)?;
                text(&c.detail, 1000)?;
                if !oid(&c.head)
                    || !names.insert(&c.name)
                    || !["passed", "failed", "notRun"].contains(&c.state.as_str())
                {
                    return Err("Invalid check metadata".into());
                }
            }
            if let Some(p) = &a.approval {
                text(&p.target, 200)?;
                if !oid(&p.head) || !oid(&p.target_head) || !oid(&p.tree) {
                    return Err("Invalid approval metadata".into());
                }
            }
        }
        Ok(value)
    };
    if !path.exists() && !folder.join("areas.json.bak").exists() {
        return Ok(Catalog {
            version: 1,
            areas: vec![],
        });
    }
    match read(&path) {
        Ok(c) => Ok(c),
        Err(primary) => {
            let mut backup = read(&folder.join("areas.json.bak"))
                .map_err(|_| format!("Area catalog and backup unreadable: {primary}"))?;
            for a in &mut backup.areas {
                if !a.removed {
                    a.operation.state = "uncertain".into();
                    a.operation.detail =
                        "Recovered backup: inspect Git state and reconcile before further actions"
                            .into();
                    a.approval = None;
                }
            }
            // Preserve every damaged original. Caller holds the workspace lock and operation mutex.
            if path.exists() {
                fs::rename(
                    &path,
                    folder.join(format!(
                        "areas.corrupt-{}.json",
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_nanos()
                    )),
                )
                .map_err(|e| e.to_string())?;
            }
            atomic_file::write(
                &path,
                &serde_json::to_vec_pretty(&backup).map_err(|e| e.to_string())?,
            )?;
            Ok(backup)
        }
    }
}
fn save(folder: &Path, c: &Catalog) -> Result<(), String> {
    let path = folder.join("areas.json");
    let backup = folder.join("areas.json.bak");
    plain(&path)?;
    plain(&backup)?;
    if path.exists() {
        atomic_file::write(&backup, &fs::read(&path).map_err(|e| e.to_string())?)?;
    }
    let bytes = serde_json::to_vec_pretty(c).map_err(|e| e.to_string())?;
    if bytes.len() > 2 * LIMIT as usize {
        return Err("Area catalog full".into());
    }
    if !backup.exists() {
        atomic_file::write(&backup, &bytes)?;
    }
    atomic_file::write(&path, &bytes)
}
pub fn catalog(folder: &Path) -> Result<Catalog, String> {
    plain(&folder.join(".areas.lock"))?;
    let _lock = Lock::acquire(&folder.join(".areas.lock"))?;
    load(folder)
}
fn owned(folder: &Path, a: &Area) -> Result<PathBuf, String> {
    if a.removed {
        return Err("Area has been removed".into());
    }
    let expected = root(folder).join(&a.id);
    let dir = canonical(&expected)?;
    if dir != canonical(Path::new(&a.directory))? {
        return Err("Managed path changed".into());
    }
    let (actual, common) = repo(&dir)?;
    if repo(Path::new(&a.repository))?.1 != a.common {
        return Err("Source repository ownership changed".into());
    }
    if actual != dir
        || common != a.common
        || git(&dir, &["symbolic-ref", "--short", "HEAD"])? != a.branch
    {
        return Err("Checkout ownership or branch changed".into());
    }
    let registration = git(
        Path::new(&a.repository),
        &["worktree", "list", "--porcelain", "-z"],
    )?;
    if !registration.split('\0').any(|l| {
        l.strip_prefix("worktree ")
            .is_some_and(|p| fs::canonicalize(p).ok().as_ref() == Some(&dir))
    }) {
        return Err("Worktree registration missing".into());
    }
    Ok(dir)
}
pub fn checkout(folder: &Path, id: &str) -> Result<String, String> {
    let c = catalog(folder)?;
    let a = c
        .areas
        .iter()
        .find(|a| a.id == id)
        .ok_or("Unknown task area")?;
    if a.operation.state != "complete" {
        return Err("Reconcile the area's operation first".into());
    }
    owned(folder, a)?;
    Ok(a.directory.clone())
}
pub fn review(folder: &Path, id: &str) -> Result<Review, String> {
    let c = catalog(folder)?;
    let a = c
        .areas
        .iter()
        .find(|a| a.id == id)
        .ok_or("Unknown task area")?;
    let dir = owned(folder, a)?;
    let h = head(&dir)?;
    let status = git(&dir, &["status", "--short", "--untracked-files=all"])?;
    let mut checks = a.checks.clone();
    for check in &mut checks {
        if check.head != h || !status.is_empty() {
            check.state = "stale".into();
        }
    }
    let approval = a
        .approval
        .clone()
        .filter(|p| p.head == h && status.is_empty());
    Ok(Review {
        head: h,
        status,
        files: git(
            &dir,
            &[
                "diff",
                "--no-ext-diff",
                "--no-textconv",
                "--name-status",
                &a.base,
                "--",
            ],
        )?,
        diff: git(
            &dir,
            &[
                "diff",
                "--no-ext-diff",
                "--no-textconv",
                "--no-renames",
                &a.base,
                "--",
            ],
        )?,
        commits: git(
            &dir,
            &[
                "log",
                "--format=%H %s",
                "-n",
                "100",
                &format!("{}..HEAD", a.base),
                "--",
            ],
        )?,
        checks,
        findings: a.findings.clone(),
        approval,
    })
}
pub fn file(folder: &Path, id: &str, relative: &str) -> Result<String, String> {
    text(relative, 240)?;
    if relative.is_empty()
        || relative.contains(['\\', ':'])
        || relative
            .split('/')
            .any(|p| p.is_empty() || p == "." || p == ".." || p.eq_ignore_ascii_case(".git"))
    {
        return Err("Choose a relative file inside the area".into());
    }
    let c = catalog(folder)?;
    let a = c.areas.iter().find(|a| a.id == id).ok_or("Unknown area")?;
    let dir = owned(folder, a)?;
    let path = canonical(&dir.join(relative))?;
    if !path.starts_with(&dir) {
        return Err("File escapes area".into());
    }
    let f = fs::File::open(path).map_err(|e| e.to_string())?;
    if f.metadata().map_err(|e| e.to_string())?.len() > 256 * 1024 {
        return Err("File exceeds 256 KiB".into());
    }
    let mut s = String::new();
    f.take(256 * 1024 + 1)
        .read_to_string(&mut s)
        .map_err(|_| "Only bounded UTF-8 text files can be viewed")?;
    if s.len() > 256 * 1024 {
        return Err("File grew beyond limit".into());
    }
    Ok(s)
}
fn preview_area(folder: &Path, a: &Area, target: &str) -> Result<Approval, String> {
    text(target, 200)?;
    git(
        Path::new(&a.repository),
        &["check-ref-format", &format!("refs/heads/{target}")],
    )?;
    let dir = owned(folder, a)?;
    clean(&dir, false)?;
    let (target_dir, common) = repo(Path::new(&a.repository))?;
    if common != a.common
        || git(&target_dir, &["symbolic-ref", "--short", "HEAD"])? != target
        || target == a.branch
    {
        return Err("Target must be the selected repository's current branch, with the original Git ownership".into());
    }
    clean(&target_dir, false)?;
    let h = head(&dir)?;
    let t = head(&target_dir)?;
    let tree = git(&dir, &["merge-tree", "--write-tree", &t, &h])?
        .lines()
        .next()
        .unwrap_or("")
        .to_owned();
    if !oid(&tree) {
        return Err(
            "Merge conflicts or unsupported merge-tree; preserve the area and resolve manually"
                .into(),
        );
    }
    // Git normally overwrites ignored files when they become tracked. Detect that
    // before approval, including file/directory replacements containing local data.
    let additions = git(
        &dir,
        &[
            "diff",
            "--no-ext-diff",
            "--no-textconv",
            "--no-renames",
            "--name-only",
            "--diff-filter=A",
            "-z",
            &t,
            &tree,
            "--",
        ],
    )?;
    for relative in additions.split('\0').filter(|p| !p.is_empty()) {
        if Path::new(relative).is_absolute() || relative.split('/').any(|p| p == "..") {
            return Err("Invalid path in merge tree".into());
        }
        let destination = target_dir.join(relative);
        plain(&destination)?;
        if destination.exists() {
            return Err("Merge would replace an existing untracked/ignored path or directory. Preserve it before previewing again.".into());
        }
    }
    Ok(Approval {
        head: h,
        target_head: t,
        target: target.into(),
        tree,
    })
}
pub fn preview(folder: &Path, id: &str, target: &str) -> Result<Approval, String> {
    let c = catalog(folder)?;
    preview_area(
        folder,
        c.areas.iter().find(|a| a.id == id).ok_or("Unknown area")?,
        target,
    )
}

pub fn action(folder: &Path, action: Action) -> Result<Catalog, String> {
    plain(&folder.join(".areas.lock"))?;
    let _lock = Lock::acquire(&folder.join(".areas.lock"))?;
    let mut c = load(folder)?;
    if let Action::Create {
        id,
        name,
        repository,
        base,
    } = action
    {
        if !id_valid(&id) || c.areas.len() >= 128 || c.areas.iter().any(|a| a.id == id) {
            return Err("Invalid or duplicate area ID / catalog full".into());
        }
        text(&name, 120)?;
        if name.trim().is_empty() || !oid(&base) {
            return Err("Supply a name and full base commit ID".into());
        }
        let (dir, common) = repo(Path::new(&repository))?;
        let resolved = git(
            &dir,
            &["rev-parse", "--verify", &format!("{base}^{{commit}}")],
        )?;
        if resolved != base {
            return Err("Base commit mismatch".into());
        }
        // Dirty source changes are deliberately excluded: worktrees start at this commit only.
        let path = root(folder).join(&id);
        // Git for Windows has a fixed-size $GIT_DIR check in worktree setup even
        // with core.longpaths enabled. Refuse before creating branches/directories.
        #[cfg(windows)]
        if display(&path).encode_utf16().count() > 230 {
            return Err("Managed worktree path exceeds Git for Windows' metadata limit. Choose a shorter workspace folder (checkout path must be at most 230 UTF-16 units). No worktree or branch was created.".into());
        }
        plain(&path)?;
        if path.exists() {
            return Err("Managed destination already exists; nothing overwritten".into());
        }
        let branch = format!("agentcanvas/{id}");
        if git_result(
            &dir,
            &[
                "show-ref",
                "--verify",
                "--quiet",
                &format!("refs/heads/{branch}"),
            ],
        )?
        .0
        {
            return Err("Branch already exists; reconcile it manually".into());
        }
        c.areas.push(Area {
            id,
            name,
            repository: display(&dir),
            common,
            directory: display(&path),
            branch,
            base,
            checks: vec![],
            findings: String::new(),
            approval: None,
            operation: Operation {
                kind: "create".into(),
                state: "pending".into(),
                detail: "Intent saved before worktree creation; never automatically retried".into(),
            },
            integrated: None,
            removed: false,
        });
        save(folder, &c)?;
        let a = c.areas.last().unwrap();
        let result = (|| {
            fs::create_dir_all(root(folder)).map_err(|e| e.to_string())?;
            git(
                &dir,
                &["worktree", "add", "-b", &a.branch, &a.directory, &a.base],
            )
        })();
        let a = c.areas.last_mut().unwrap();
        a.operation.state = if result.is_ok() {
            "complete"
        } else {
            "uncertain"
        }
        .into();
        a.operation.detail = diagnostic(result.unwrap_or_else(|e| e));
        save(folder, &c)?;
        return Ok(c);
    }
    let id = match &action {
        Action::Check { id, .. }
        | Action::Findings { id, .. }
        | Action::Approve { id, .. }
        | Action::Integrate { id, .. }
        | Action::Cleanup { id }
        | Action::Reconcile { id } => id,
        _ => unreachable!(),
    };
    let index = c
        .areas
        .iter()
        .position(|a| &a.id == id)
        .ok_or("Unknown task area")?;
    let a = &mut c.areas[index];
    if let Action::Reconcile { .. } = action {
        // Observation only; never retries create/merge/remove or deletes an unknown path.
        if !Path::new(&a.directory).exists() {
            let listed = git(
                Path::new(&a.repository),
                &["worktree", "list", "--porcelain", "-z"],
            )?;
            if listed.split('\0').any(|l| {
                l.strip_prefix("worktree ")
                    .is_some_and(|p| Path::new(p) == Path::new(&a.directory))
            }) {
                return Err("Git still registers the missing worktree; inspect it manually".into());
            }
            a.removed = true;
        } else {
            owned(folder, a)?;
            clean(Path::new(&a.directory), false)?;
            if a.operation.kind == "integrate" {
                clean(Path::new(&a.repository), false)?;
                let source = head(Path::new(&a.directory))?;
                if git_result(
                    Path::new(&a.repository),
                    &["merge-base", "--is-ancestor", &source, "HEAD"],
                )?
                .0
                {
                    a.integrated = Some(head(Path::new(&a.repository))?);
                }
            }
        }
        a.operation.state = "complete".into();
        a.operation.detail="User reconciled observed checkout; no operation replayed. Review target history before another integration.".into();
        a.approval = None;
        save(folder, &c)?;
        return Ok(c);
    }
    if a.operation.state != "complete" {
        return Err("Reconcile the uncertain operation before continuing".into());
    }
    let dir = owned(folder, a)?;
    match action {
        Action::Check {
            head: expected,
            name,
            state,
            detail,
            ..
        } => {
            if head(&dir)? != expected {
                return Err("Reviewed commit changed".into());
            }
            clean(&dir, false)?;
            text(&name, 120)?;
            text(&detail, 1000)?;
            if name.trim().is_empty() || !["passed", "failed", "notRun"].contains(&state.as_str()) {
                return Err("Invalid check record".into());
            }
            a.checks.retain(|c| c.name != name);
            if a.checks.len() >= 128 {
                return Err("Check limit reached".into());
            }
            a.checks.push(Check {
                head: expected,
                name,
                state,
                detail,
            });
            a.approval = None;
        }
        Action::Findings {
            head: expected,
            text: value,
            ..
        } => {
            if head(&dir)? != expected {
                return Err("Reviewed commit changed".into());
            }
            text(&value, 4096)?;
            a.findings = format!("Commit {expected}\n{value}");
            a.approval = None;
        }
        Action::Approve { preview, .. } => {
            if preview_area(folder, a, &preview.target)? != preview {
                return Err("Preview is stale; review again".into());
            }
            if !a
                .checks
                .iter()
                .any(|c| c.head == preview.head && c.state == "passed")
                || a.checks
                    .iter()
                    .any(|c| c.head != preview.head || c.state != "passed")
            {
                return Err(
                    "Record current passed checks for every declared check before approving".into(),
                );
            }
            a.approval = Some(preview);
        }
        Action::Integrate { preview, .. } => {
            if a.approval.as_ref() != Some(&preview)
                || preview_area(folder, a, &preview.target)? != preview
            {
                return Err("Approval or heads are stale; preview and approve again".into());
            }
            a.operation = Operation {
                kind: "integrate".into(),
                state: "pending".into(),
                detail: format!(
                    "Source {} target {} tree {}",
                    preview.head, preview.target_head, preview.tree
                ),
            };
            save(folder, &c)?;
            let a = &c.areas[index];
            // Revalidate after writing intent, immediately before touching the target.
            let result = (|| {
                if preview_area(folder, a, &preview.target)? != preview {
                    return Err("Heads moved after intent was saved".into());
                }
                git(
                    Path::new(&a.repository),
                    &[
                        "merge",
                        "--no-ff",
                        "--no-edit",
                        "--no-verify",
                        "--no-gpg-sign",
                        "--no-overwrite-ignore",
                        &preview.head,
                    ],
                )?;
                head(Path::new(&a.repository))
            })();
            let a = &mut c.areas[index];
            a.approval = None;
            match result {
                Ok(h) => {
                    a.integrated = Some(h.clone());
                    a.operation.state = "complete".into();
                    a.operation.detail = format!("Integrated as {h}");
                }
                Err(e) => {
                    a.operation.state = "uncertain".into();
                    a.operation.detail = diagnostic(e);
                }
            }
        }
        Action::Cleanup { .. } => {
            if a.integrated.is_none() {
                return Err("Preserve unintegrated work; integrate before managed cleanup".into());
            }
            clean(&dir, true)?;
            let source = head(&dir)?;
            if !git_result(
                Path::new(&a.repository),
                &["merge-base", "--is-ancestor", &source, "HEAD"],
            )?
            .0
            {
                return Err("Area has commits not present in target; preserve them".into());
            }
            a.operation = Operation {
                kind: "cleanup".into(),
                state: "pending".into(),
                detail: format!(
                    "Remove only registered clean worktree at {}. Branch retained.",
                    a.directory
                ),
            };
            save(folder, &c)?;
            let a = &c.areas[index];
            let result = (|| {
                owned(folder, a)?;
                clean(&dir, true)?;
                git(
                    Path::new(&a.repository),
                    &["worktree", "remove", &a.directory],
                )
            })();
            let a = &mut c.areas[index];
            a.operation.state = if result.is_ok() {
                "complete"
            } else {
                "uncertain"
            }
            .into();
            a.removed = result.is_ok();
            a.operation.detail = diagnostic(result.unwrap_or_else(|e| e));
            a.approval = None;
        }
        _ => unreachable!(),
    }
    save(folder, &c)?;
    Ok(c)
}

#[cfg(test)]
mod tests;
