use super::*;
use crate::tasks::{Action, Snapshot, Store};
use std::{fs, path::PathBuf};
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let p = std::env::current_dir()
            .unwrap()
            .join("target")
            .join(format!("team-test-{}", uuid().unwrap()));
        fs::create_dir_all(&p).unwrap();
        Self(p)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        if self.0.parent() == Some(std::env::current_dir().unwrap().join("target").as_path())
            && self
                .0
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("team-test-")
        {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
}
fn job(node: &str) -> Job {
    Job {
        id: uuid().unwrap(),
        title: "Fixture task".into(),
        brief: "Independent change".into(),
        criteria: "Structured checks pass".into(),
        dependencies: vec![],
        agent: node.into(),
        area: Some(uuid().unwrap()),
        reviewer: None,
        review_task: None,
    }
}
fn control(
    s: &mut Store,
    c: Control,
    live: &HashMap<String, String>,
    now: u64,
) -> Result<Snapshot, String> {
    let rev = s.snapshot().board.revision;
    s.control(rev, c, live, now, &HashMap::new())
}
fn user(
    s: &mut Store,
    a: Action,
    live: &HashMap<String, String>,
    now: u64,
) -> Result<serde_json::Value, String> {
    let rev = s.snapshot().board.revision;
    s.execute(Actor::User, &uuid().unwrap(), Some(rev), a, live, now)
}
fn finish(s: &mut Store, id: &str, live: &HashMap<String, String>, now: u64) {
    let t = s
        .snapshot()
        .board
        .tasks
        .into_iter()
        .find(|t| t.id == id)
        .unwrap();
    let a = t.attempts.last().unwrap();
    let node = &t.assigned_to;
    let generation = live.get(node).unwrap();
    for action in [
        Action::Ack {
            id: id.into(),
            attempt_id: a.id.clone(),
        },
        Action::Result {
            id: id.into(),
            attempt_id: a.id.clone(),
            summary: "Fixture finished with selected evidence".into(),
            artifacts: vec!["evidence/result.md".into()],
        },
    ] {
        s.execute(
            Actor::Agent { node, generation },
            &uuid().unwrap(),
            None,
            action,
            live,
            now,
        )
        .unwrap();
    }
}
fn prepare(
    s: &mut Store,
    plan: Plan,
    coordinator: Option<String>,
    limits: Limits,
    live: &HashMap<String, String>,
) {
    control(
        s,
        Control::New {
            id: uuid().unwrap(),
            goal: plan.goal.clone(),
            coordinator,
            limits,
            permissions: Permissions {
                dispatch: true,
                ..Permissions::default()
            },
        },
        live,
        1,
    )
    .unwrap();
    control(s, Control::Adopt { plan }, live, 2).unwrap();
    control(s, Control::Start { automatic: true }, live, 3).unwrap();
}
#[test]
fn two_independent_tasks_run_together_and_dependent_work_waits_for_both_user_acceptances() {
    let f = Fixture::new();
    let mut s = Store::open(&f.0).unwrap();
    let nodes = [uuid().unwrap(), uuid().unwrap(), uuid().unwrap()];
    let live = nodes.iter().map(|n| (n.clone(), uuid().unwrap())).collect();
    let a = job(&nodes[0]);
    let b = job(&nodes[1]);
    let mut c = job(&nodes[2]);
    c.dependencies = vec![a.id.clone(), b.id.clone()];
    let ids = [a.id.clone(), b.id.clone(), c.id.clone()];
    let available = ids.iter().cloned().collect();
    prepare(
        &mut s,
        Plan {
            goal: "Three-task fixture".into(),
            jobs: vec![a, b, c],
            checks: vec![],
            repositories: vec![],
        },
        None,
        Limits::default(),
        &live,
    );
    s.scheduler_tick(&live, &available, 4, &HashMap::new())
        .unwrap();
    let board = s.snapshot().board;
    assert_eq!(
        board
            .tasks
            .iter()
            .filter(|t| t.state == Status::Running)
            .count(),
        2
    );
    assert!(board.tasks[2].attempts.is_empty());
    finish(&mut s, &ids[0], &live, 5);
    finish(&mut s, &ids[1], &live, 5);
    user(&mut s, Action::Accept { id: ids[0].clone() }, &live, 6).unwrap();
    s.scheduler_tick(&live, &available, 7, &HashMap::new())
        .unwrap();
    assert!(s.snapshot().board.tasks[2].attempts.is_empty());
    user(&mut s, Action::Accept { id: ids[1].clone() }, &live, 8).unwrap();
    s.scheduler_tick(&live, &available, 9, &HashMap::new())
        .unwrap();
    assert_eq!(s.snapshot().board.tasks[2].attempts.len(), 1);
    assert_eq!(s.snapshot().board.orchestration.unwrap().dispatched, 3);
    // Lost UI responses and repeated ticks cannot duplicate the live attempt.
    s.scheduler_tick(&live, &available, 10, &HashMap::new())
        .unwrap();
    assert_eq!(s.snapshot().board.tasks[2].attempts.len(), 1);
    finish(&mut s, &ids[2], &live, 11);
    user(&mut s, Action::Accept { id: ids[2].clone() }, &live, 12).unwrap();
    s.scheduler_tick(&live, &available, 13, &HashMap::new())
        .unwrap();
    assert_eq!(s.snapshot().board.orchestration.unwrap().state, "done");
}
#[test]
fn review_rejection_requires_bounded_explicit_revision_and_retry_backoff() {
    let f = Fixture::new();
    let mut s = Store::open(&f.0).unwrap();
    let node = uuid().unwrap();
    let reviewer = uuid().unwrap();
    let live = HashMap::from([
        (node.clone(), uuid().unwrap()),
        (reviewer.clone(), uuid().unwrap()),
    ]);
    let mut j = job(&node);
    let builder = j.id.clone();
    let review = uuid().unwrap();
    j.reviewer = Some(reviewer);
    j.review_task = Some(review.clone());
    let limits = Limits {
        attempts: 2,
        backoff_ms: 100,
        ..Limits::default()
    };
    prepare(
        &mut s,
        Plan {
            goal: "Independent review fixture".into(),
            jobs: vec![j],
            checks: vec![],
            repositories: vec![],
        },
        None,
        limits,
        &live,
    );
    let available = HashSet::from([builder.clone(), review.clone()]);
    s.scheduler_tick(&live, &available, 4, &HashMap::new())
        .unwrap();
    finish(&mut s, &builder, &live, 5);
    assert!(user(
        &mut s,
        Action::Accept {
            id: builder.clone()
        },
        &live,
        6
    )
    .is_err());
    let heads = HashMap::from([(review.clone(), "a".repeat(40))]);
    s.scheduler_tick(&live, &available, 7, &heads).unwrap();
    assert_eq!(
        s.snapshot().board.orchestration.as_ref().unwrap().reviews[0]
            .head
            .as_deref(),
        Some("a".repeat(40).as_str())
    );
    finish(&mut s, &review, &live, 8);
    user(
        &mut s,
        Action::Reject {
            id: review.clone(),
            reason: "Missing regression".into(),
        },
        &live,
        9,
    )
    .unwrap();
    control(
        &mut s,
        Control::Revise {
            id: builder.clone(),
            reason: "Add the regression".into(),
        },
        &live,
        10,
    )
    .unwrap();
    assert!(
        s.snapshot().board.orchestration.as_ref().unwrap().reviews[0]
            .head
            .is_none()
    );
    control(&mut s, Control::Start { automatic: true }, &live, 11).unwrap();
    s.scheduler_tick(&live, &available, 12, &heads).unwrap();
    assert_eq!(s.snapshot().board.tasks[0].attempts.len(), 1);
    s.scheduler_tick(&live, &available, 120, &heads).unwrap();
    assert_eq!(s.snapshot().board.tasks[0].attempts.len(), 2);
    finish(&mut s, &builder, &live, 121);
    assert!(control(
        &mut s,
        Control::Revise {
            id: builder,
            reason: "Unbounded loop refused".into()
        },
        &live,
        122
    )
    .is_err());
}
#[test]
fn coordinator_proposals_cannot_execute_or_grant_permissions_and_worker_crashes_block() {
    let f = Fixture::new();
    let mut s = Store::open(&f.0).unwrap();
    let node = uuid().unwrap();
    let coordinator = uuid().unwrap();
    let live = HashMap::from([
        (node.clone(), uuid().unwrap()),
        (coordinator.clone(), uuid().unwrap()),
    ]);
    let p = Plan {
        goal: "Human adopts".into(),
        jobs: vec![job(&node)],
        checks: vec![],
        repositories: vec![],
    };
    control(
        &mut s,
        Control::New {
            id: uuid().unwrap(),
            goal: p.goal.clone(),
            coordinator: Some(coordinator.clone()),
            limits: Limits::default(),
            permissions: Permissions::default(),
        },
        &live,
        1,
    )
    .unwrap();
    assert!(s
        .execute(
            Actor::Agent {
                node: &node,
                generation: &live[&node]
            },
            &uuid().unwrap(),
            None,
            Action::Propose { plan: p.clone() },
            &live,
            2
        )
        .is_err());
    s.execute(
        Actor::Agent {
            node: &coordinator,
            generation: &live[&coordinator],
        },
        &uuid().unwrap(),
        None,
        Action::Propose { plan: p.clone() },
        &live,
        2,
    )
    .unwrap();
    assert!(s.snapshot().board.tasks.is_empty());
    assert!(
        !s.snapshot()
            .board
            .orchestration
            .as_ref()
            .unwrap()
            .permissions
            .dispatch
    );
    assert!(serde_json::from_value::<Action>(
        serde_json::json!({"type":"permissions","permissions":{"launch":true}})
    )
    .is_err());
    control(&mut s, Control::Adopt { plan: p.clone() }, &live, 3).unwrap();
    control(
        &mut s,
        Control::Permissions {
            permissions: Permissions {
                dispatch: true,
                ..Permissions::default()
            },
        },
        &live,
        4,
    )
    .unwrap();
    control(&mut s, Control::Start { automatic: true }, &live, 5).unwrap();
    let available = HashSet::from([p.jobs[0].id.clone()]);
    s.scheduler_tick(&live, &available, 6, &HashMap::new())
        .unwrap();
    let crashed = HashMap::from([(coordinator.clone(), live[&coordinator].clone())]);
    s.scheduler_tick(&crashed, &available, 7, &HashMap::new())
        .unwrap();
    assert_eq!(s.snapshot().board.orchestration.unwrap().state, "blocked");
    assert_eq!(s.snapshot().board.tasks[0].attempts.len(), 1);
}
#[test]
fn permission_revocation_exhausted_budget_coordinator_timeout_and_restart_never_resume_implicitly()
{
    let f = Fixture::new();
    let mut s = Store::open(&f.0).unwrap();
    let node = uuid().unwrap();
    let live = HashMap::from([(node.clone(), uuid().unwrap())]);
    let j = job(&node);
    let available = HashSet::from([j.id.clone()]);
    prepare(
        &mut s,
        Plan {
            goal: "Bounded".into(),
            jobs: vec![j],
            checks: vec![],
            repositories: vec![],
        },
        None,
        Limits {
            runtime_ms: 1000,
            ..Limits::default()
        },
        &live,
    );
    control(
        &mut s,
        Control::Permissions {
            permissions: Permissions::default(),
        },
        &live,
        4,
    )
    .unwrap();
    s.scheduler_tick(&live, &available, 5, &HashMap::new())
        .unwrap();
    assert!(s.snapshot().board.tasks[0].attempts.is_empty());
    assert!(control(&mut s, Control::Start { automatic: true }, &live, 6).is_err());
    control(
        &mut s,
        Control::Permissions {
            permissions: Permissions {
                dispatch: true,
                ..Permissions::default()
            },
        },
        &live,
        7,
    )
    .unwrap();
    control(&mut s, Control::Start { automatic: true }, &live, 8).unwrap();
    drop(s);
    let mut s = Store::open(&f.0).unwrap();
    assert_eq!(
        s.snapshot().board.orchestration.as_ref().unwrap().state,
        "paused"
    );
    s.scheduler_tick(&live, &available, 9, &HashMap::new())
        .unwrap();
    assert!(s.snapshot().board.tasks[0].attempts.is_empty());
    control(&mut s, Control::Start { automatic: true }, &live, 10).unwrap();
    s.scheduler_tick(&live, &available, 1011, &HashMap::new())
        .unwrap();
    assert_eq!(
        s.snapshot().board.orchestration.as_ref().unwrap().state,
        "blocked"
    );
    assert!(s.snapshot().board.tasks[0].attempts.is_empty());
    let f2 = Fixture::new();
    let mut s = Store::open(&f2.0).unwrap();
    let c = uuid().unwrap();
    let mut live = live;
    live.insert(c.clone(), uuid().unwrap());
    let j = job(&node);
    let available = HashSet::from([j.id.clone()]);
    prepare(
        &mut s,
        Plan {
            goal: "Heartbeat".into(),
            jobs: vec![j],
            checks: vec![],
            repositories: vec![],
        },
        Some(c),
        Limits::default(),
        &live,
    );
    s.scheduler_tick(&live, &available, 120004, &HashMap::new())
        .unwrap();
    assert!(s
        .snapshot()
        .board
        .orchestration
        .unwrap()
        .reason
        .contains("Coordinator"));
    assert!(s.snapshot().board.tasks[0].attempts.is_empty());
}
#[cfg(windows)]
#[test]
fn failed_atomic_dispatch_save_leaves_no_attempt_to_replay() {
    use std::os::windows::fs::OpenOptionsExt;
    let f = Fixture::new();
    let mut s = Store::open(&f.0).unwrap();
    let node = uuid().unwrap();
    let live = HashMap::from([(node.clone(), uuid().unwrap())]);
    let j = job(&node);
    let available = HashSet::from([j.id.clone()]);
    prepare(
        &mut s,
        Plan {
            goal: "Atomic dispatch".into(),
            jobs: vec![j],
            checks: vec![],
            repositories: vec![],
        },
        None,
        Limits::default(),
        &live,
    );
    let locked = fs::OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(f.0.join("tasks.json"))
        .unwrap();
    assert!(s
        .scheduler_tick(&live, &available, 4, &HashMap::new())
        .is_err());
    assert!(s.snapshot().board.tasks[0].attempts.is_empty());
    drop(locked);
    s.scheduler_tick(&live, &available, 5, &HashMap::new())
        .unwrap();
    assert_eq!(s.snapshot().board.tasks[0].attempts.len(), 1);
}
#[cfg(windows)]
#[test]
fn declared_check_timeout_cancellation_and_exit_codes_are_observed_without_saved_output() {
    use std::{
        sync::Arc,
        thread,
        time::{Duration, Instant},
    };
    let runner = Arc::new(crate::check_runner::CheckRunner::default());
    let program = PathBuf::from(std::env::var_os("WINDIR").unwrap())
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
    let spec = Check {
        id: uuid().unwrap(),
        task: uuid().unwrap(),
        name: "Declared fixture".into(),
        program: program.to_string_lossy().into_owned(),
        args: vec![
            "-NoProfile".into(),
            "-NonInteractive".into(),
            "-Command".into(),
            "exit 0".into(),
        ],
        timeout_ms: 10000,
    };
    let cwd = std::env::current_dir()
        .unwrap()
        .to_string_lossy()
        .into_owned();
    assert_eq!(runner.run(&spec, &cwd, || Ok(())).unwrap(), "passed");
    let mut failed = spec.clone();
    failed.args[3] = "exit 7".into();
    assert_eq!(runner.run(&failed, &cwd, || Ok(())).unwrap(), "failed");
    let mut slow = spec;
    slow.args[3] = "Start-Sleep -Seconds 60".into();
    slow.timeout_ms = 100;
    assert!(runner.run(&slow, &cwd, || Ok(())).is_err());
    slow.timeout_ms = 10000;
    let other = runner.clone();
    let child = thread::spawn(move || other.run(&slow, &cwd, || Ok(())));
    let deadline = Instant::now() + Duration::from_secs(5);
    while runner.active().is_none() && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(10));
    }
    assert!(runner.active().is_some());
    runner.stop();
    assert!(child.join().unwrap().is_err());
    assert!(runner.active().is_none());
}
#[test]
fn defaults_are_bounded_and_no_privileged_permissions_are_implied() {
    let l = Limits::default();
    assert_eq!(l.concurrency, 2);
    let p = Permissions::default();
    assert!(!p.dispatch && !p.launch && !p.integrate && !p.provision && !p.checks && !p.messaging);
}
#[test]
fn handoff_preserves_old_attempt_identity_and_requires_reconciliation_before_reassignment() {
    let f = Fixture::new();
    let mut s = Store::open(&f.0).unwrap();
    let old = uuid().unwrap();
    let new = uuid().unwrap();
    let live = HashMap::from([
        (old.clone(), uuid().unwrap()),
        (new.clone(), uuid().unwrap()),
    ]);
    let j = job(&old);
    let id = j.id.clone();
    let available = HashSet::from([id.clone()]);
    prepare(
        &mut s,
        Plan {
            goal: "Handoff".into(),
            jobs: vec![j],
            checks: vec![],
            repositories: vec![],
        },
        None,
        Limits {
            backoff_ms: 100,
            ..Limits::default()
        },
        &live,
    );
    s.scheduler_tick(&live, &available, 4, &HashMap::new())
        .unwrap();
    assert!(control(
        &mut s,
        Control::Handoff {
            id: id.clone(),
            agent: new.clone()
        },
        &live,
        5
    )
    .is_err());
    s.reconcile(&HashMap::new(), 6).unwrap();
    assert!(control(
        &mut s,
        Control::Handoff {
            id: id.clone(),
            agent: new.clone()
        },
        &live,
        7
    )
    .is_err());
    let mut stopped = live.clone();
    stopped.remove(&old);
    user(
        &mut s,
        Action::Resolve {
            id: id.clone(),
            outcome: Status::Ready,
        },
        &stopped,
        8,
    )
    .unwrap();
    control(
        &mut s,
        Control::Handoff {
            id: id.clone(),
            agent: new.clone(),
        },
        &stopped,
        9,
    )
    .unwrap();
    control(&mut s, Control::Start { automatic: true }, &stopped, 10).unwrap();
    s.scheduler_tick(&stopped, &available, 110, &HashMap::new())
        .unwrap();
    let t = s
        .snapshot()
        .board
        .tasks
        .into_iter()
        .find(|t| t.id == id)
        .unwrap();
    assert_eq!(t.attempts[0].assigned_to.as_deref(), Some(old.as_str()));
    assert_eq!(t.attempts[1].assigned_to.as_deref(), Some(new.as_str()));
    let a = t.attempts.last().unwrap();
    assert!(s
        .execute(
            Actor::Agent {
                node: &old,
                generation: &live[&old]
            },
            &uuid().unwrap(),
            None,
            Action::Result {
                id,
                attempt_id: a.id.clone(),
                summary: "Old writer refused".into(),
                artifacts: vec![]
            },
            &stopped,
            111
        )
        .is_err());
}
#[test]
fn proposals_reject_cycles_and_shared_reviewer_identity() {
    let a = uuid().unwrap();
    let b = uuid().unwrap();
    let node = uuid().unwrap();
    let mut p = Plan {
        goal: "Test".into(),
        jobs: vec![
            Job {
                id: a.clone(),
                title: "A".into(),
                brief: "A".into(),
                criteria: "A".into(),
                dependencies: vec![b.clone()],
                agent: node.clone(),
                area: None,
                reviewer: None,
                review_task: None,
            },
            Job {
                id: b,
                title: "B".into(),
                brief: "B".into(),
                criteria: "B".into(),
                dependencies: vec![a],
                agent: node.clone(),
                area: None,
                reviewer: None,
                review_task: None,
            },
        ],
        checks: vec![],
        repositories: vec![],
    };
    assert!(validate_plan(&p).is_err());
    p.jobs[0].dependencies.clear();
    p.jobs[1].reviewer = Some(node);
    p.jobs[1].review_task = Some(uuid().unwrap());
    p.jobs[1].area = Some(uuid().unwrap());
    assert!(validate_plan(&p).is_err());
}
