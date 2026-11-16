use super::*;
use std::sync::atomic::{AtomicU64, Ordering};
static SEQ: AtomicU64 = AtomicU64::new(1);
const A: &str = "00000000-0000-4000-8000-000000000001";
const B: &str = "00000000-0000-4000-8000-000000000002";
struct Fixture {
    root: PathBuf,
    repo: PathBuf,
    folder: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let root = std::env::current_dir()
            .unwrap()
            .join("target")
            .join(format!(
                "area-test-{}-{} space-世界",
                std::process::id(),
                SEQ.fetch_add(1, Ordering::Relaxed)
            ));
        let repo = root.join("repository");
        let folder = root.join("workspace");
        fs::create_dir_all(&repo).unwrap();
        fs::create_dir_all(&folder).unwrap();
        git(&repo, &["init", "-b", "main"]).unwrap();
        fs::write(repo.join("same.txt"), "base\n").unwrap();
        fs::write(repo.join(".gitignore"), "ignored\n").unwrap();
        git(&repo, &["add", "."]).unwrap();
        git(&repo, &["commit", "-m", "base"]).unwrap();
        Self { root, repo, folder }
    }
    fn create(&self, id: &str) -> Area {
        action(
            &self.folder,
            Action::Create {
                id: id.into(),
                name: "Builder".into(),
                repository: display(&self.repo),
                base: head(&self.repo).unwrap(),
            },
        )
        .unwrap()
        .areas
        .into_iter()
        .find(|a| a.id == id)
        .unwrap()
    }
    fn commit(&self, a: &Area, value: &str) {
        fs::write(Path::new(&a.directory).join("same.txt"), value).unwrap();
        git(Path::new(&a.directory), &["add", "."]).unwrap();
        git(Path::new(&a.directory), &["commit", "-m", "task change"]).unwrap();
    }
    fn approve(&self, a: &Area) -> Approval {
        let p = preview(&self.folder, &a.id, "main").unwrap();
        action(
            &self.folder,
            Action::Check {
                id: a.id.clone(),
                head: p.head.clone(),
                name: "Regression".into(),
                state: "passed".into(),
                detail: "Explicit user check record".into(),
            },
        )
        .unwrap();
        action(
            &self.folder,
            Action::Approve {
                id: a.id.clone(),
                preview: p.clone(),
            },
        )
        .unwrap();
        p
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let expected = std::env::current_dir().unwrap().join("target");
        if self.root.parent() == Some(expected.as_path())
            && self
                .root
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("area-test-")
        {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
}

#[test]
fn editor_file_locations_are_owned_bounded_regular_files() {
    let f = Fixture::new();
    let a = f.create(A);
    let dir = Path::new(&a.directory);
    fs::write(dir.join("Unicode space-世界.txt"), "reviewed text\n").unwrap();
    assert_eq!(
        file_location(&f.folder, A, "Unicode space-世界.txt").unwrap(),
        display(&canonical(&dir.join("Unicode space-世界.txt")).unwrap())
    );
    for relative in [
        "../repository/same.txt",
        "/same.txt",
        "C:/same.txt",
        "notes\\file.txt",
        ".git",
        ".git/config",
        "missing.txt",
    ] {
        assert!(file_location(&f.folder, A, relative).is_err(), "{relative}");
    }
    fs::create_dir(dir.join("directory")).unwrap();
    assert!(file_location(&f.folder, A, "directory").is_err());
    fs::write(dir.join("large.txt"), vec![b'x'; 256 * 1024 + 1]).unwrap();
    assert!(file_location(&f.folder, A, "large.txt").is_err());
    git(dir, &["checkout", "-b", "ownership-changed"]).unwrap();
    assert!(file_location(&f.folder, A, "same.txt").is_err());
}
#[test]
fn isolated_unicode_worktrees_review_integrate_and_cleanup() {
    let f = Fixture::new();
    let a = f.create(A);
    let b = f.create(B);
    f.commit(&a, "builder one\n");
    f.commit(&b, "builder two\n");
    assert_eq!(
        fs::read_to_string(f.repo.join("same.txt")).unwrap(),
        "base\n"
    );
    assert_eq!(
        fs::read_to_string(Path::new(&b.directory).join("same.txt")).unwrap(),
        "builder two\n"
    );
    let r = review(&f.folder, A).unwrap();
    assert!(r.diff.contains("builder one"));
    assert!(r.commits.contains("task change"));
    assert_eq!(file(&f.folder, A, "same.txt").unwrap(), "builder one\n");
    assert!(file(&f.folder, A, "../repository/same.txt").is_err());
    assert!(file(&f.folder, A, ".git").is_err());
    let p = f.approve(&a);
    let c = action(
        &f.folder,
        Action::Integrate {
            id: A.into(),
            preview: p,
        },
    )
    .unwrap();
    assert!(c.areas[0].integrated.is_some());
    assert_eq!(
        fs::read_to_string(f.repo.join("same.txt"))
            .unwrap()
            .replace("\r\n", "\n"),
        "builder one\n"
    );
    assert!(preview(&f.folder, B, "main").is_err()); // Same-line changes conflict; both checkouts survive.
    fs::write(Path::new(&a.directory).join("ignored"), "secret").unwrap();
    assert!(action(&f.folder, Action::Cleanup { id: A.into() }).is_err());
    fs::remove_file(Path::new(&a.directory).join("ignored")).unwrap();
    action(&f.folder, Action::Cleanup { id: A.into() }).unwrap();
    assert!(!Path::new(&a.directory).exists());
    assert!(Path::new(&b.directory).exists());
    assert!(git(
        &f.repo,
        &["show-ref", "--verify", &format!("refs/heads/{}", a.branch)]
    )
    .is_ok());
}
#[test]
fn stale_heads_checks_dirty_targets_and_rejected_work_are_preserved() {
    let f = Fixture::new();
    let a = f.create(A);
    f.commit(&a, "first\n");
    let old = f.approve(&a);
    f.commit(&a, "second\n");
    assert_eq!(review(&f.folder, A).unwrap().checks[0].state, "stale");
    assert!(action(
        &f.folder,
        Action::Integrate {
            id: A.into(),
            preview: old
        }
    )
    .is_err());
    let current = f.approve(&a);
    fs::write(f.repo.join("untracked"), "keep").unwrap();
    assert!(action(
        &f.folder,
        Action::Integrate {
            id: A.into(),
            preview: current.clone()
        }
    )
    .is_err());
    fs::remove_file(f.repo.join("untracked")).unwrap();
    fs::write(f.repo.join("target-only"), "new").unwrap();
    git(&f.repo, &["add", "."]).unwrap();
    git(&f.repo, &["commit", "-m", "moved target"]).unwrap();
    assert!(action(
        &f.folder,
        Action::Integrate {
            id: A.into(),
            preview: current
        }
    )
    .is_err());
    assert!(action(&f.folder, Action::Cleanup { id: A.into() }).is_err());
    assert!(Path::new(&a.directory).exists());
}
#[test]
fn pending_intents_never_replay_and_corrupt_originals_are_preserved() {
    let f = Fixture::new();
    let a = f.create(A);
    let mut c = catalog(&f.folder).unwrap();
    c.areas[0].operation.state = "pending".into();
    save(&f.folder, &c).unwrap();
    assert!(checkout(&f.folder, A).is_err());
    assert_eq!(
        catalog(&f.folder).unwrap().areas[0].operation.state,
        "pending"
    );
    action(&f.folder, Action::Reconcile { id: A.into() }).unwrap();
    checkout(&f.folder, A).unwrap();
    fs::write(f.folder.join("areas.json"), "corrupt").unwrap();
    assert_eq!(catalog(&f.folder).unwrap().areas.len(), 1);
    assert!(fs::read_dir(&f.folder).unwrap().any(|e| e
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with("areas.corrupt-")));
    assert!(Path::new(&a.directory).exists());
}
#[test]
fn paths_ownership_duplicates_limits_and_linked_sources() {
    let f = Fixture::new();
    let a = f.create(A);
    assert!(action(
        &f.folder,
        Action::Create {
            id: A.into(),
            name: "duplicate".into(),
            repository: display(&f.repo),
            base: head(&f.repo).unwrap()
        }
    )
    .is_err());
    let c = action(
        &f.folder,
        Action::Create {
            id: B.into(),
            name: "Linked source".into(),
            repository: a.directory.clone(),
            base: head(Path::new(&a.directory)).unwrap(),
        },
    )
    .unwrap();
    assert_eq!(c.areas[1].common, a.common);
    fs::write(
        Path::new(&a.directory).join("large"),
        vec![b'x'; 256 * 1024 + 1],
    )
    .unwrap();
    assert!(file(&f.folder, A, "large").is_err());
    git(Path::new(&a.directory), &["checkout", "--detach"]).unwrap();
    assert!(checkout(&f.folder, A).is_err());
}
#[test]
fn git_filters_do_not_run_as_bootstrap() {
    let f = Fixture::new();
    git(
        &f.repo,
        &["config", "filter.unsafe.smudge", "untrusted-command"],
    )
    .unwrap();
    assert!(action(
        &f.folder,
        Action::Create {
            id: A.into(),
            name: "Unsafe".into(),
            repository: display(&f.repo),
            base: head(&f.repo).unwrap()
        }
    )
    .is_err());
}

#[test]
fn normal_git_eol_commits_remain_clean_in_managed_review() {
    let f = Fixture::new();
    let a = f.create(A);
    let dir = Path::new(&a.directory);
    fs::write(dir.join("same.txt"), b"normal Windows edit\r\n").unwrap();
    // Use the installed Git's ordinary EOL settings, as a real external agent does.
    for args in [
        vec!["add", "same.txt"],
        vec![
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@localhost",
            "-c",
            "core.hooksPath=NUL",
            "commit",
            "-m",
            "external EOL commit",
        ],
    ] {
        let output = Command::new("git")
            .current_dir(dir)
            .args(args)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    assert!(review(&f.folder, A).unwrap().status.is_empty());
    f.approve(&a);
}

#[test]
fn merge_preview_preserves_ignored_target_files_when_source_starts_tracking_them() {
    let f = Fixture::new();
    let a = f.create(A);
    let dir = Path::new(&a.directory);
    fs::write(dir.join("ignored"), "task content\n").unwrap();
    git(dir, &["add", "-f", "ignored"]).unwrap();
    git(dir, &["commit", "-m", "track a formerly ignored path"]).unwrap();
    fs::write(f.repo.join("ignored"), "local secret\n").unwrap();
    assert!(preview(&f.folder, A, "main")
        .unwrap_err()
        .contains("untracked/ignored"));
    assert_eq!(
        fs::read_to_string(f.repo.join("ignored")).unwrap(),
        "local secret\n"
    );
}

#[test]
fn interrupted_merge_and_cleanup_reconcile_without_replaying_mutations() {
    let f = Fixture::new();
    let a = f.create(A);
    f.commit(&a, "accepted\n");
    let p = f.approve(&a);
    let mut c = catalog(&f.folder).unwrap();
    c.areas[0].operation = Operation {
        kind: "integrate".into(),
        state: "pending".into(),
        detail: "Crash before merge".into(),
    };
    save(&f.folder, &c).unwrap();
    assert_eq!(
        fs::read_to_string(f.repo.join("same.txt")).unwrap(),
        "base\n"
    );
    assert!(checkout(&f.folder, A).is_err());
    // Crash after Git succeeds but before journal completion: observe, never merge twice.
    git(&f.repo, &["merge", "--no-ff", "--no-edit", &p.head]).unwrap();
    let integrated = head(&f.repo).unwrap();
    let c = action(&f.folder, Action::Reconcile { id: A.into() }).unwrap();
    assert_eq!(c.areas[0].integrated.as_deref(), Some(integrated.as_str()));
    assert_eq!(head(&f.repo).unwrap(), integrated);
    let mut c = catalog(&f.folder).unwrap();
    c.areas[0].operation = Operation {
        kind: "cleanup".into(),
        state: "pending".into(),
        detail: "Crash before remove".into(),
    };
    save(&f.folder, &c).unwrap();
    assert!(Path::new(&a.directory).exists());
    assert!(!catalog(&f.folder).unwrap().areas[0].removed);
    git(&f.repo, &["worktree", "remove", &a.directory]).unwrap();
    assert!(
        action(&f.folder, Action::Reconcile { id: A.into() })
            .unwrap()
            .areas[0]
            .removed
    );
}

#[test]
fn unsupported_schema_and_unregistered_paths_are_preserved() {
    let f = Fixture::new();
    let a = f.create(A);
    let mut c = catalog(&f.folder).unwrap();
    c.version = 2;
    let bytes = serde_json::to_vec(&c).unwrap();
    fs::write(f.folder.join("areas.json"), &bytes).unwrap();
    assert!(catalog(&f.folder).is_err());
    assert_eq!(fs::read(f.folder.join("areas.json")).unwrap(), bytes);
    c.version = 1;
    fs::write(f.folder.join("areas.json"), serde_json::to_vec(&c).unwrap()).unwrap();
    // An unrelated directory is never adopted or recursively removed.
    let unknown = root(&f.folder).join("unknown");
    fs::create_dir_all(&unknown).unwrap();
    fs::write(unknown.join("keep"), "data").unwrap();
    assert!(action(&f.folder, Action::Cleanup { id: B.into() }).is_err());
    assert!(unknown.join("keep").exists());
    assert!(Path::new(&a.directory).exists());
}

#[cfg(windows)]
#[test]
fn canonical_workspace_paths_and_long_managed_directories_roundtrip() {
    let mut f = Fixture::new();
    f.folder = fs::canonicalize(&f.folder).unwrap();
    let a = f.create(A);
    checkout(&f.folder, A).unwrap();
    assert_eq!(catalog(&f.folder).unwrap().areas[0].directory, a.directory);
    f.folder = f.folder.join("long-directory-".repeat(11));
    fs::create_dir_all(&f.folder).unwrap();
    f.folder = fs::canonicalize(&f.folder).unwrap();
    let result = action(
        &f.folder,
        Action::Create {
            id: B.into(),
            name: "Long path".into(),
            repository: display(&f.repo),
            base: head(&f.repo).unwrap(),
        },
    );
    assert!(result.err().unwrap().contains("shorter workspace"));
    assert!(!root(&f.folder).join(B).exists());
    assert!(
        !git_result(
            &f.repo,
            &[
                "show-ref",
                "--verify",
                "--quiet",
                &format!("refs/heads/agentcanvas/{B}")
            ]
        )
        .unwrap()
        .0
    );
}
#[cfg(windows)]
#[test]
fn reparse_escapes_and_locked_files_refuse_cleanup() {
    use std::os::windows::fs::OpenOptionsExt;
    let f = Fixture::new();
    let a = f.create(A);
    f.commit(&a, "done\n");
    let p = f.approve(&a);
    action(
        &f.folder,
        Action::Integrate {
            id: A.into(),
            preview: p,
        },
    )
    .unwrap();
    let locked = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .open(Path::new(&a.directory).join("same.txt"))
        .unwrap();
    let c = action(&f.folder, Action::Cleanup { id: A.into() });
    assert!(c.is_err() || !c.unwrap().areas[0].removed);
    drop(locked);
    assert!(Path::new(&a.directory).exists());
    let junction = f.root.join("escape");
    let status = Command::new("cmd")
        .args(["/d", "/c", "mklink", "/J"])
        .arg(&junction)
        .arg(&a.directory)
        .stdout(Stdio::null())
        .status()
        .unwrap();
    assert!(status.success());
    assert!(plain(&junction.join("same.txt")).is_err());
}
