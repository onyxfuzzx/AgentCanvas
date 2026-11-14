use super::*;
use std::sync::atomic::{AtomicU64, Ordering};
const NODE: &str = "00000000-0000-4000-8000-000000000001";
const GEN: &str = "00000000-0000-4000-8000-000000000002";
const TASK: &str = "00000000-0000-4000-8000-000000000003";
const ATTEMPT: &str = "00000000-0000-4000-8000-000000000004";
static SEQ: AtomicU64 = AtomicU64::new(100);
#[test]
fn different_agents_cannot_dispatch_into_one_managed_checkout() {
    let f = Fixture::new();
    let mut s = Store::open(&f.0).unwrap();
    let second = id();
    let node = id();
    let area = id();
    user(&mut s, create(TASK), 1).unwrap();
    user(
        &mut s,
        Action::Checkout {
            id: TASK.into(),
            area_id: Some(area.clone()),
        },
        2,
    )
    .unwrap();
    user(
        &mut s,
        Action::Create {
            id: second.clone(),
            title: "Second".into(),
            brief: "Other agent".into(),
            criteria: "Checks".into(),
            dependencies: vec![],
            assigned_to: node.clone(),
        },
        3,
    )
    .unwrap();
    user(
        &mut s,
        Action::Checkout {
            id: second.clone(),
            area_id: Some(area),
        },
        4,
    )
    .unwrap();
    user(&mut s, Action::Ready { id: TASK.into() }, 5).unwrap();
    user(&mut s, Action::Ready { id: second.clone() }, 6).unwrap();
    user(
        &mut s,
        Action::Dispatch {
            id: TASK.into(),
            attempt_id: ATTEMPT.into(),
        },
        7,
    )
    .unwrap();
    let mut writers = live();
    writers.insert(node, GEN.into());
    let rev = s.board.revision;
    assert!(s
        .execute(
            Actor::User,
            &id(),
            Some(rev),
            Action::Dispatch {
                id: second.clone(),
                attempt_id: id()
            },
            &writers,
            8
        )
        .is_err());
    s.reconcile(&HashMap::new(), 9).unwrap();
    let rev = s.board.revision;
    assert!(s
        .execute(
            Actor::User,
            &id(),
            Some(rev),
            Action::Dispatch {
                id: second,
                attempt_id: id()
            },
            &writers,
            10
        )
        .is_err());
}
fn id() -> String {
    format!(
        "00000000-0000-4000-8000-{:012x}",
        SEQ.fetch_add(1, Ordering::Relaxed)
    )
}
fn live() -> HashMap<String, String> {
    HashMap::from([(NODE.into(), GEN.into())])
}
fn create(id: &str) -> Action {
    Action::Create {
        id: id.into(),
        title: "Fix parser".into(),
        brief: "Handle split input".into(),
        criteria: "Regression passes".into(),
        dependencies: Vec::new(),
        assigned_to: NODE.into(),
    }
}
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let p = std::env::current_dir()
            .unwrap()
            .join("target")
            .join(format!("task-test-{}-{}", std::process::id(), id()));
        fs::create_dir_all(&p).unwrap();
        Self(p)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let root = std::env::current_dir().unwrap().join("target");
        if self.0.parent() == Some(root.as_path())
            && self
                .0
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("task-test-")
        {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
}
fn user(s: &mut Store, a: Action, now: u64) -> Result<Value, String> {
    let revision = s.board.revision;
    s.execute(Actor::User, &id(), Some(revision), a, &live(), now)
}
fn agent(s: &mut Store, a: Action, now: u64) -> Result<Value, String> {
    s.execute(
        Actor::Agent {
            node: NODE,
            generation: GEN,
        },
        &id(),
        None,
        a,
        &live(),
        now,
    )
}
fn dispatched(s: &mut Store) {
    user(s, create(TASK), 1).unwrap();
    user(s, Action::Ready { id: TASK.into() }, 2).unwrap();
    user(
        s,
        Action::Dispatch {
            id: TASK.into(),
            attempt_id: ATTEMPT.into(),
        },
        3,
    )
    .unwrap();
}
#[test]
fn cooperative_result_requires_ack_and_user_acceptance() {
    let f = Fixture::new();
    let mut s = Store::open(&f.0).unwrap();
    dispatched(&mut s);
    let result = Action::Result {
        id: TASK.into(),
        attempt_id: ATTEMPT.into(),
        summary: "Fixed; test fixture passed".into(),
        artifacts: vec!["src/parser.rs".into()],
    };
    assert!(agent(&mut s, result.clone(), 4).is_err());
    agent(
        &mut s,
        Action::Ack {
            id: TASK.into(),
            attempt_id: ATTEMPT.into(),
        },
        4,
    )
    .unwrap();
    agent(&mut s, result, 5).unwrap();
    assert_eq!(s.board.tasks[0].state, Status::Review);
    assert!(agent(&mut s, Action::Accept { id: TASK.into() }, 6).is_err());
    user(&mut s, Action::Accept { id: TASK.into() }, 6).unwrap();
    assert_eq!(s.board.tasks[0].state, Status::Done);
    assert!(s.board.validate().is_ok());
}
#[test]
fn lost_ack_response_is_deduplicated_after_store_reload() {
    let f = Fixture::new();
    let mut s = Store::open(&f.0).unwrap();
    dispatched(&mut s);
    let key = id();
    let action = Action::Ack {
        id: TASK.into(),
        attempt_id: ATTEMPT.into(),
    };
    let first = s
        .execute(
            Actor::Agent {
                node: NODE,
                generation: GEN,
            },
            &key,
            None,
            action.clone(),
            &live(),
            4,
        )
        .unwrap();
    drop(s);
    let mut s = Store::open(&f.0).unwrap();
    let repeated = s
        .execute(
            Actor::Agent {
                node: NODE,
                generation: GEN,
            },
            &key,
            None,
            action,
            &live(),
            5,
        )
        .unwrap();
    assert_eq!(first, repeated);
    assert_eq!(s.board.revision, 4);
    assert!(s
        .execute(
            Actor::Agent {
                node: NODE,
                generation: GEN
            },
            &key,
            None,
            Action::Progress {
                id: TASK.into(),
                attempt_id: ATTEMPT.into(),
                summary: "Different action".into()
            },
            &live(),
            6
        )
        .is_err());
}
#[test]
fn startup_and_lease_expiry_block_ambiguous_work_until_old_process_stops() {
    let f = Fixture::new();
    let mut s = Store::open(&f.0).unwrap();
    dispatched(&mut s);
    drop(s);
    let mut s = Store::open(&f.0).unwrap();
    s.reconcile(&HashMap::new(), 4).unwrap();
    assert_eq!(s.board.tasks[0].state, Status::Blocked);
    assert!(user(
        &mut s,
        Action::Resolve {
            id: TASK.into(),
            outcome: Status::Ready
        },
        5
    )
    .is_err());
    let revision = s.board.revision;
    s.execute(
        Actor::User,
        &id(),
        Some(revision),
        Action::Resolve {
            id: TASK.into(),
            outcome: Status::Ready,
        },
        &HashMap::new(),
        5,
    )
    .unwrap();
    user(
        &mut s,
        Action::Dispatch {
            id: TASK.into(),
            attempt_id: id(),
        },
        6,
    )
    .unwrap();
    s.reconcile(&live(), LEASE_MS + 6).unwrap();
    assert_eq!(
        s.board.tasks[0].attempts.last().unwrap().state,
        AttemptStatus::Interrupted
    );
    assert!(agent(
        &mut s,
        Action::Result {
            id: TASK.into(),
            attempt_id: ATTEMPT.into(),
            summary: "late".into(),
            artifacts: vec![]
        },
        LEASE_MS + 7
    )
    .is_err());
}
#[test]
fn cycles_dependencies_and_duplicate_writers_are_rejected_transactionally() {
    let f = Fixture::new();
    let mut s = Store::open(&f.0).unwrap();
    user(&mut s, create(TASK), 1).unwrap();
    let second = id();
    let mut action = create(&second);
    if let Action::Create { dependencies, .. } = &mut action {
        dependencies.push(TASK.into());
    }
    user(&mut s, action, 2).unwrap();
    let cycle = Action::Edit {
        id: TASK.into(),
        title: "Cycle".into(),
        brief: "x".into(),
        criteria: "x".into(),
        assigned_to: NODE.into(),
        dependencies: vec![second.clone()],
    };
    assert!(user(&mut s, cycle, 3).is_err());
    assert_eq!(s.board.tasks[0].title, "Fix parser");
    user(&mut s, Action::Ready { id: second.clone() }, 4).unwrap();
    assert!(user(
        &mut s,
        Action::Dispatch {
            id: second,
            attempt_id: id()
        },
        5
    )
    .is_err());
    user(&mut s, Action::Ready { id: TASK.into() }, 6).unwrap();
    user(
        &mut s,
        Action::Dispatch {
            id: TASK.into(),
            attempt_id: ATTEMPT.into(),
        },
        7,
    )
    .unwrap();
    let third = id();
    user(&mut s, create(&third), 8).unwrap();
    user(&mut s, Action::Ready { id: third.clone() }, 9).unwrap();
    assert!(user(
        &mut s,
        Action::Dispatch {
            id: third,
            attempt_id: id()
        },
        10
    )
    .is_err());
}
#[test]
fn cancellation_and_stale_generation_cannot_complete() {
    let f = Fixture::new();
    let mut s = Store::open(&f.0).unwrap();
    dispatched(&mut s);
    agent(
        &mut s,
        Action::Ack {
            id: TASK.into(),
            attempt_id: ATTEMPT.into(),
        },
        4,
    )
    .unwrap();
    user(&mut s, Action::Cancel { id: TASK.into() }, 5).unwrap();
    assert_eq!(s.board.tasks[0].state, Status::Blocked);
    assert!(agent(
        &mut s,
        Action::Result {
            id: TASK.into(),
            attempt_id: ATTEMPT.into(),
            summary: "late".into(),
            artifacts: vec![]
        },
        6
    )
    .is_err());
    agent(
        &mut s,
        Action::Cancelled {
            id: TASK.into(),
            attempt_id: ATTEMPT.into(),
        },
        7,
    )
    .unwrap();
    assert_eq!(s.board.tasks[0].state, Status::Cancelled);
    let wrong = id();
    assert!(s
        .execute(
            Actor::Agent {
                node: NODE,
                generation: &wrong
            },
            &id(),
            None,
            Action::Ack {
                id: TASK.into(),
                attempt_id: ATTEMPT.into()
            },
            &live(),
            8
        )
        .is_err());
}
#[test]
fn external_edits_and_unsupported_schema_preserve_originals() {
    let f = Fixture::new();
    let mut s = Store::open(&f.0).unwrap();
    user(&mut s, create(TASK), 1).unwrap();
    let external = b"{\"version\":99}";
    fs::write(f.0.join("tasks.json"), external).unwrap();
    assert!(user(&mut s, Action::Ready { id: TASK.into() }, 2).is_err());
    assert_eq!(fs::read(f.0.join("tasks.json")).unwrap(), external);
    assert!(Store::open(&f.0).is_err());
}
#[test]
fn corrupt_primary_recovers_and_is_archived_on_save() {
    let f = Fixture::new();
    let mut s = Store::open(&f.0).unwrap();
    user(&mut s, create(TASK), 1).unwrap();
    user(&mut s, Action::Ready { id: TASK.into() }, 2).unwrap();
    drop(s);
    fs::write(f.0.join("tasks.json"), b"{truncated").unwrap();
    let mut s = Store::open(&f.0).unwrap();
    assert!(s.snapshot().recovered);
    assert_eq!(fs::read(f.0.join("tasks.json")).unwrap(), b"{truncated");
    user(&mut s, Action::Ready { id: TASK.into() }, 3).unwrap();
    let archive = fs::read_dir(&f.0)
        .unwrap()
        .map(|e| e.unwrap().path())
        .find(|p| {
            p.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("tasks.corrupt-")
        })
        .unwrap();
    assert_eq!(fs::read(archive).unwrap(), b"{truncated");
}
#[test]
fn bounds_and_untrusted_paths_cannot_enter_durable_data() {
    let f = Fixture::new();
    let mut s = Store::open(&f.0).unwrap();
    let mut a = create(TASK);
    if let Action::Create { brief, .. } = &mut a {
        *brief = "é".repeat(2049);
    }
    assert!(user(&mut s, a, 1).is_err());
    assert!(s.board.tasks.is_empty());
    dispatched(&mut s);
    agent(
        &mut s,
        Action::Ack {
            id: TASK.into(),
            attempt_id: ATTEMPT.into(),
        },
        4,
    )
    .unwrap();
    assert!(agent(
        &mut s,
        Action::Result {
            id: TASK.into(),
            attempt_id: ATTEMPT.into(),
            summary: "x".into(),
            artifacts: vec!["../secret".into()]
        },
        5
    )
    .is_err());
    assert!(
        !String::from_utf8(fs::read(f.0.join("tasks.json")).unwrap())
            .unwrap()
            .contains("../secret")
    );
}

#[test]
fn stale_ui_revisions_and_wrong_assignees_cannot_overwrite_tasks() {
    let f = Fixture::new();
    let mut s = Store::open(&f.0).unwrap();
    dispatched(&mut s);
    let revision = s.board.revision;
    agent(
        &mut s,
        Action::Ack {
            id: TASK.into(),
            attempt_id: ATTEMPT.into(),
        },
        4,
    )
    .unwrap();
    assert!(s
        .execute(
            Actor::User,
            &id(),
            Some(revision),
            Action::Cancel { id: TASK.into() },
            &live(),
            5
        )
        .is_err());
    let stranger = id();
    let mut others = live();
    others.insert(stranger.clone(), GEN.into());
    assert!(s
        .execute(
            Actor::Agent {
                node: &stranger,
                generation: GEN
            },
            &id(),
            None,
            Action::Get { id: TASK.into() },
            &others,
            6
        )
        .is_err());
    assert!(s
        .execute(
            Actor::Agent {
                node: &stranger,
                generation: GEN
            },
            &id(),
            None,
            Action::Progress {
                id: TASK.into(),
                attempt_id: ATTEMPT.into(),
                summary: "forged".into()
            },
            &others,
            7
        )
        .is_err());
    assert_eq!(
        s.board.tasks[0].attempts[0].state,
        AttemptStatus::Acknowledged
    );
}

#[test]
fn inbox_is_paginated_and_generation_rotation_interrupts_old_attempts() {
    let f = Fixture::new();
    let mut s = Store::open(&f.0).unwrap();
    dispatched(&mut s);
    for _ in 0..17 {
        user(&mut s, create(&id()), 4).unwrap();
    }
    let first = agent(&mut s, Action::Inbox { after: None }, 5).unwrap();
    assert_eq!(first["tasks"].as_array().unwrap().len(), 16);
    let cursor = first["next"].as_str().unwrap().to_owned();
    let second = agent(
        &mut s,
        Action::Inbox {
            after: Some(cursor),
        },
        6,
    )
    .unwrap();
    assert_eq!(second["tasks"].as_array().unwrap().len(), 2);
    assert!(second["next"].is_null());
    let replacement = id();
    let rotated = HashMap::from([(NODE.into(), replacement.clone())]);
    assert!(s
        .execute(
            Actor::Agent {
                node: NODE,
                generation: &replacement
            },
            &id(),
            None,
            Action::Result {
                id: TASK.into(),
                attempt_id: ATTEMPT.into(),
                summary: "new process cannot finish old work".into(),
                artifacts: vec![]
            },
            &rotated,
            7
        )
        .is_err());
    assert_eq!(s.board.tasks[0].state, Status::Blocked);
}

#[cfg(windows)]
#[test]
fn failed_atomic_replace_does_not_commit_a_transition_or_receipt() {
    use std::os::windows::fs::OpenOptionsExt;
    let f = Fixture::new();
    let mut s = Store::open(&f.0).unwrap();
    user(&mut s, create(TASK), 1).unwrap();
    let revision = s.board.revision;
    let key = id();
    let guard = fs::OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(f.0.join("tasks.json"))
        .unwrap();
    let action = Action::Ready { id: TASK.into() };
    assert!(s
        .execute(
            Actor::User,
            &key,
            Some(revision),
            action.clone(),
            &live(),
            2
        )
        .is_err());
    assert_eq!(s.board.revision, revision);
    assert_eq!(s.board.tasks[0].state, Status::Draft);
    assert_eq!(
        Store::open(&f.0).unwrap().board.tasks[0].state,
        Status::Draft
    );
    drop(guard);
    s.execute(Actor::User, &key, Some(revision), action, &live(), 3)
        .unwrap();
    assert_eq!(s.board.revision, revision + 1);
    assert_eq!(s.board.tasks[0].state, Status::Ready);
}
