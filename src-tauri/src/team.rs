use super::*;
use crate::{orchestrator::Control, tasks::Status};

// Git validation may take longer than an IPC request's deadline. Capture only
// its inputs under the collaboration lock, then reject stale results on commit.
pub(super) struct Validation {
    pub board: crate::tasks::Board,
    workspace: String,
    folder: PathBuf,
    nodes: HashMap<String, Node>,
    live: HashMap<String, String>,
    generations: HashMap<String, String>,
    revision: u64,
    closing_nodes: HashSet<String>,
}

fn members(board: &crate::tasks::Board) -> Vec<String> {
    let Some(r) = &board.orchestration else {
        return vec![];
    };
    let mut ids: Vec<String> = board
        .tasks
        .iter()
        .filter(|t| r.tasks.contains(&t.id))
        .map(|t| t.assigned_to.clone())
        .collect();
    if let Some(c) = &r.coordinator {
        ids.push(c.clone());
    }
    ids.sort();
    ids.dedup();
    ids
}
impl Collaboration {
    pub(super) fn validation(s: &mut State) -> Result<Validation, String> {
        Ok(Validation {
            board: task_store(s)?.snapshot().board,
            workspace: s.workspace.clone(),
            folder: s.folder.clone(),
            nodes: s.nodes.clone(),
            live: s.live.clone(),
            generations: s.generations.clone(),
            revision: s.revision,
            closing_nodes: s.closing_nodes.clone(),
        })
    }
    pub(super) fn validation_current(s: &mut State, v: &Validation) -> Result<bool, String> {
        Ok(s.workspace == v.workspace
            && s.folder == v.folder
            && s.revision == v.revision
            && s.live == v.live
            && s.generations == v.generations
            && s.closing_nodes == v.closing_nodes
            && task_store(s)?.snapshot().board.revision == v.board.revision)
    }
    pub(super) fn validate_task_action(
        &self,
        v: &Validation,
        action: &crate::tasks::Action,
    ) -> Result<(), String> {
        match action {
            crate::tasks::Action::Dispatch { id, .. } => {
                let t = v
                    .board
                    .tasks
                    .iter()
                    .find(|t| &t.id == id)
                    .ok_or("Task unavailable")?;
                if v.board
                    .orchestration
                    .as_ref()
                    .is_some_and(|r| r.tasks.contains(id))
                {
                    self.team_available(v, t)?;
                }
                if let Some(area) = &t.checkout_ref {
                    let directory = crate::areas::checkout(&v.folder, area)?;
                    if std::fs::canonicalize(self.pty.launched_directory(&t.assigned_to)?)
                        .map_err(|e| e.to_string())?
                        != std::fs::canonicalize(directory).map_err(|e| e.to_string())?
                    {
                        return Err(
                            "Assigned terminal must launch in the task area's checkout".into()
                        );
                    }
                }
            }
            crate::tasks::Action::Accept { id } => self.validate_team_accept(v, id)?,
            crate::tasks::Action::Checkout {
                area_id: Some(id), ..
            } => {
                crate::areas::checkout(&v.folder, id)?;
            }
            _ => {}
        }
        Ok(())
    }
    pub fn team_pause(&self, workspace: &str) -> Result<(), String> {
        let mut s = self.state.lock().map_err(|_| "Team unavailable")?;
        if s.workspace != workspace {
            return Ok(());
        }
        let live = s.generations.clone();
        let store = task_store(&mut s)?;
        store.reconcile(&live, task_now())?;
        let snapshot = store.snapshot();
        if snapshot
            .board
            .orchestration
            .as_ref()
            .is_some_and(|r| ["running", "manual"].contains(&r.state.as_str()))
        {
            store.control(
                snapshot.board.revision,
                Control::Pause,
                &live,
                task_now(),
                &HashMap::new(),
            )?;
        }
        Ok(())
    }
    pub fn team_snapshot(&self, workspace: &str) -> Result<Value, String> {
        let snapshot = self.task_snapshot(workspace)?;
        let s = self.state.lock().map_err(|_| "Team unavailable")?;
        if s.workspace != workspace {
            return Err("Workspace changed".into());
        }
        let agents:Vec<Value>=s.nodes.values().filter(|n|n.kind=="terminal").map(|n|json!({"node":n,"live":s.live.contains_key(&n.id),"stopping":s.closing_nodes.contains(&n.id)})).collect();
        Ok(
            json!({"snapshot":snapshot,"agents":agents,"schedulerError":s.scheduler_error,"usage":{"tokens":null,"cost":null,"source":"Provider usage unavailable; no monetary cap claimed"}}),
        )
    }
    pub(super) fn team_available(
        &self,
        s: &Validation,
        t: &crate::tasks::Task,
    ) -> Result<Option<String>, String> {
        if !s.live.contains_key(&t.assigned_to) || !self.pty.has_session(&t.assigned_to)? {
            return Err("Start the assigned existing agent before dispatch".into());
        }
        let directory = std::fs::canonicalize(self.pty.launched_directory(&t.assigned_to)?)
            .map_err(|e| e.to_string())?;
        if s.board.tasks.iter().any(|other| {
            other.id != t.id
                && other
                    .attempts
                    .last()
                    .is_some_and(|a| crate::orchestrator::uncertain(&a.state))
                && self
                    .pty
                    .launched_directory(&other.assigned_to)
                    .ok()
                    .and_then(|p| std::fs::canonicalize(p).ok())
                    .as_ref()
                    == Some(&directory)
        }) {
            return Err("Another task owns this actual working directory".into());
        }
        if let Some(area) = &t.checkout_ref {
            let dir = crate::areas::checkout(&s.folder, area)?;
            if std::fs::canonicalize(dir).map_err(|e| e.to_string())?
                != std::fs::canonicalize(self.pty.launched_directory(&t.assigned_to)?)
                    .map_err(|e| e.to_string())?
            {
                return Err("Assigned agent launched in a different checkout".into());
            }
            if t.review_of.is_some() {
                let r = crate::areas::review(&s.folder, area)?;
                if !r.status.is_empty() {
                    return Err("Commit and clean builder changes before independent review".into());
                }
                return Ok(Some(r.head));
            }
        } else if t.review_of.is_some() {
            return Err("Independent review requires a managed checkout".into());
        }
        Ok(None)
    }
    pub(super) fn validate_team_accept(&self, s: &Validation, id: &str) -> Result<(), String> {
        let board = &s.board;
        let Some(run) = board.orchestration.as_ref() else {
            return Ok(());
        };
        let link = run
            .reviews
            .iter()
            .find(|v| v.builder == id || v.reviewer == id);
        if let Some(v) = link {
            let builder = board
                .tasks
                .iter()
                .find(|t| t.id == v.builder)
                .ok_or("Builder unavailable")?;
            if builder.attempts.last().map(|a| &a.id) != v.builder_attempt.as_ref() {
                return Err("Review belongs to an older builder attempt".into());
            }
            let area = builder
                .checkout_ref
                .as_deref()
                .ok_or("Review checkout missing")?;
            let review = crate::areas::review(&s.folder, area)?;
            if !review.status.is_empty() || v.head.as_deref() != Some(&review.head) {
                return Err(
                    "Reviewed commit changed; revise and obtain fresh independent review".into(),
                );
            }
            if v.builder == id
                && (review.checks.is_empty()
                    || review
                        .checks
                        .iter()
                        .any(|c| c.state != "passed" || c.head != review.head))
            {
                return Err("Current commit checks must pass before accepting the builder".into());
            }
            if v.builder == id
                && run.plan.as_ref().is_some_and(|p| {
                    p.checks
                        .iter()
                        .filter(|c| c.task == v.builder)
                        .any(|declared| {
                            !review.checks.iter().any(|c| {
                                c.name == declared.name
                                    && c.head == review.head
                                    && c.state == "passed"
                            })
                        })
                })
            {
                return Err(
                    "Every check declared for this builder must pass at the reviewed commit".into(),
                );
            }
        }
        Ok(())
    }
    pub fn team_control(
        &self,
        workspace: &str,
        revision: u64,
        control: Control,
    ) -> Result<crate::tasks::Snapshot, String> {
        let mut s = self.state.lock().map_err(|_| "Team unavailable")?;
        if s.workspace != workspace {
            return Err("Workspace is no longer active".into());
        }
        let validation = Self::validation(&mut s)?;
        let before = &validation.board;
        drop(s);
        let s = &validation;
        let mut heads = HashMap::new();
        match &control {
            Control::New {
                coordinator: Some(id),
                ..
            }
            | Control::Coordinator { node: Some(id) } => {
                if !s.nodes.get(id).is_some_and(|n| n.agent.is_some()) {
                    return Err("Choose an existing coordinator agent".into());
                }
            }
            Control::Adopt { plan } => {
                for j in &plan.jobs {
                    for id in std::iter::once(&j.agent).chain(j.reviewer.iter()) {
                        if !s.nodes.get(id).is_some_and(|n| n.kind == "terminal") {
                            return Err("Discover or recruit the assigned agents before adopting the proposal".into());
                        }
                    }
                    if let Some(area) = &j.area {
                        crate::areas::checkout(&s.folder, area)?;
                    }
                }
                for c in &plan.checks {
                    crate::areas::plain(Path::new(&c.program))?;
                    if !Path::new(&c.program).is_file() {
                        return Err("Declared check executable is unavailable".into());
                    }
                }
                for repo in &plan.repositories {
                    crate::areas::plain(Path::new(repo))?;
                    if !Path::new(repo).is_dir() {
                        return Err("Provision repository is unavailable".into());
                    }
                }
            }
            Control::Dispatch { id } => {
                let t = before
                    .tasks
                    .iter()
                    .find(|t| &t.id == id)
                    .ok_or("Task unavailable")?;
                if let Some(head) = self.team_available(s, t)? {
                    heads.insert(id.clone(), head);
                }
            }
            Control::Handoff { id, agent } => {
                let t = before
                    .tasks
                    .iter()
                    .find(|t| &t.id == id)
                    .ok_or("Task unavailable")?;
                if !s.nodes.get(agent).is_some_and(|n| n.kind == "terminal")
                    || self.pty.has_session(&t.assigned_to)?
                    || self.pty.has_session(agent)?
                {
                    return Err(
                        "Stop the old and replacement agent, reconcile, then hand off".into(),
                    );
                }
            }
            Control::Revise { id, .. } => {
                let linked = before
                    .orchestration
                    .as_ref()
                    .and_then(|r| r.reviews.iter().find(|v| &v.builder == id));
                for t in before
                    .tasks
                    .iter()
                    .filter(|t| &t.id == id || linked.is_some_and(|v| v.reviewer == t.id))
                {
                    if self.pty.has_session(&t.assigned_to)? {
                        return Err("Stop builder and reviewer before staging a revision".into());
                    }
                }
            }
            _ => {}
        }
        let mut s = self.state.lock().map_err(|_| "Team unavailable")?;
        if !Self::validation_current(&mut s, &validation)? {
            return Err("Workspace, task board or agent changed during validation. Refresh before retrying.".into());
        }
        let live = s
            .generations
            .iter()
            .filter(|(id, _)| s.live.contains_key(*id))
            .map(|(id, g)| (id.clone(), g.clone()))
            .collect();
        let now = task_now();
        let result = task_store(&mut s)?.control(revision, control, &live, now, &heads)?;
        let ids = members(&result.board);
        if result
            .board
            .orchestration
            .as_ref()
            .is_some_and(|r| !r.permissions.messaging)
        {
            s.cancel(|l| ids.contains(&l.source) || ids.contains(&l.target));
        }
        s.scheduler_error = None;
        Ok(result)
    }
    pub fn team_tick(&self) {
        let result = (|| -> Result<(), String> {
            let mut s = self.state.lock().map_err(|_| "Team unavailable")?;
            if s.workspace.is_empty() || s.scheduler_error.is_some() {
                return Ok(());
            }
            let live = s
                .generations
                .iter()
                .filter(|(id, _)| s.live.contains_key(*id))
                .map(|(id, g)| (id.clone(), g.clone()))
                .collect();
            let now = task_now();
            task_store(&mut s)?.reconcile(&live, now)?;
            let board = task_store(&mut s)?.snapshot().board;
            let Some(run) = &board.orchestration else {
                return Ok(());
            };
            let mut available = HashSet::new();
            let mut heads = HashMap::new();
            let mut directories = HashSet::new();
            let validation = Self::validation(&mut s)?;
            drop(s);
            if run.state == "running" {
                for t in board
                    .tasks
                    .iter()
                    .filter(|t| run.tasks.contains(&t.id) && t.state == Status::Ready)
                {
                    let deps = t.dependencies.iter().all(|d| {
                        board.tasks.iter().any(|source| {
                            &source.id == d
                                && (source.state == Status::Done
                                    || (t.review_of.as_ref() == Some(d)
                                        && source.state == Status::Review))
                        })
                    });
                    if !deps {
                        continue;
                    }
                    if let Ok(head) = self.team_available(&validation, t) {
                        let directory =
                            std::fs::canonicalize(self.pty.launched_directory(&t.assigned_to)?)
                                .map_err(|e| e.to_string())?;
                        if !directories.insert(directory) {
                            continue;
                        }
                        available.insert(t.id.clone());
                        if let Some(head) = head {
                            heads.insert(t.id.clone(), head);
                        }
                    }
                }
            }
            let mut s = self.state.lock().map_err(|_| "Team unavailable")?;
            if !Self::validation_current(&mut s, &validation)? {
                // A worker result, revocation or stop won the race. A later tick
                // starts fresh; stale validation must never dispatch an attempt.
                return Ok(());
            }
            task_store(&mut s)?.scheduler_tick(&live, &available, task_now(), &heads)
        })();
        if let Err(error) = result {
            if let Ok(mut s) = self.state.lock() {
                s.scheduler_error = Some(error);
            }
        }
        let budget_stop = self.state.lock().ok().and_then(|s| {
            s.tasks
                .as_ref()
                .and_then(|t| t.snapshot().board.orchestration)
                .filter(|r| {
                    r.state == "blocked"
                        && r.reason.to_ascii_lowercase().contains("budget exhausted")
                })
                .map(|_| s.workspace.clone())
        });
        if let Some(workspace) = budget_stop {
            let _ = self.team_stop(&workspace);
        }
    }
    pub fn team_launch(
        &self,
        workspace: &str,
        id: &str,
        cols: u16,
        rows: u16,
    ) -> Result<crate::pty::SpawnReply, String> {
        let node = {
            let mut s = self.state.lock().map_err(|_| "Team unavailable")?;
            if s.workspace != workspace {
                return Err("Workspace changed".into());
            }
            let b = task_store(&mut s)?.snapshot().board;
            let r = b.orchestration.as_ref().ok_or("Create a run first")?;
            if !r.permissions.launch
                || !members(&b).contains(&id.to_string())
                || s.closing_nodes.contains(id)
            {
                return Err("Launch permission revoked or agent outside run scope".into());
            }
            if s.live.keys().filter(|id| members(&b).contains(id)).count() >= 4 {
                return Err("Team launch capacity is four live agents".into());
            }
            s.nodes.get(id).cloned().ok_or("Agent unavailable")?
        };
        if self.pty.has_session(id)? {
            return Err("Agent already has a process; stop it before replacement".into());
        }
        self.validate_area_launch(id, node.cwd.as_deref().unwrap_or(""))?;
        let settings=node.agent.clone().ok_or("Choose an installed-agent preset; cooperative shells launch through their explicit terminal controls")?;
        let env = self.attach(id)?;
        let result = self.pty.spawn_agent(
            id.into(),
            crate::agents::AgentLaunch {
                name: node.title,
                settings,
            },
            node.cwd.unwrap_or_default(),
            cols,
            rows,
            env,
        );
        if result.is_err() {
            self.detach(id);
        }
        if result.is_ok() {
            let allowed = {
                let mut s = self.state.lock().map_err(|_| "Team unavailable")?;
                let b = task_store(&mut s)?.snapshot().board;
                b.orchestration
                    .as_ref()
                    .is_some_and(|r| r.permissions.launch && r.state != "cancelled")
                    && s.workspace == workspace
                    && members(&b).contains(&id.to_string())
            };
            if !allowed {
                let _ = self.pty.close(id);
                self.detach(id);
                return Err("Launch permission revoked during startup; process stopped".into());
            }
        }
        result
    }
    pub fn team_stop(&self, workspace: &str) -> Result<Value, String> {
        let ids = {
            let mut s = self.state.lock().map_err(|_| "Team unavailable")?;
            if s.workspace != workspace {
                return Err("Workspace changed".into());
            }
            let live = s.generations.clone();
            let now = task_now();
            let prepared = (|| -> Result<_, String> {
                let store = task_store(&mut s)?;
                store.reconcile(&live, now)?;
                let snapshot = store.snapshot();
                let ids = members(&snapshot.board);
                let persisted = store.control(
                    snapshot.board.revision,
                    Control::Cancel,
                    &live,
                    now,
                    &HashMap::new(),
                );
                Ok((ids, persisted))
            })();
            let ids = match prepared {
                Ok((ids, persisted)) => {
                    if let Err(e) = persisted {
                        s.scheduler_error = Some(format!(
                            "Cancellation save failed: {e}; processes are still being stopped"
                        ));
                    }
                    ids
                }
                Err(e) => {
                    s.scheduler_error = Some(format!(
                        "Run storage unavailable: {e}; all workspace terminals are being stopped"
                    ));
                    s.nodes
                        .values()
                        .filter(|n| n.kind == "terminal")
                        .map(|n| n.id.clone())
                        .collect()
                }
            };
            for id in &ids {
                s.live.remove(id);
                s.generations.insert(id.clone(), "stopping".into());
                s.closing_nodes.insert(id.clone());
            }
            s.cancel(|l| ids.contains(&l.source) || ids.contains(&l.target));
            ids
        };
        let mut failures = Vec::new();
        for id in &ids {
            match self.pty.close(id) {
                Ok(()) => self.detach(id),
                Err(e) => failures.push(format!("{id}: {e}")),
            }
        }
        let mut s = self.state.lock().map_err(|_| "Team unavailable")?;
        let live = s.generations.clone();
        if let Ok(store) = task_store(&mut s) {
            let _ = store.reconcile(&live, task_now());
        }
        Ok(json!({"stopped":ids,"stillStopping":failures,"saveError":s.scheduler_error}))
    }
    pub fn team_authority(
        &self,
        workspace: &str,
        run_id: &str,
        kind: &str,
        area: Option<&str>,
        repository: Option<&str>,
    ) -> Result<(), String> {
        let mut s = self.state.lock().map_err(|_| "Team unavailable")?;
        if s.workspace != workspace {
            return Err("Workspace changed".into());
        }
        let b = task_store(&mut s)?.snapshot().board;
        let r = b
            .orchestration
            .as_ref()
            .filter(|r| r.id == run_id)
            .ok_or("Run changed")?;
        let allowed = match kind {
            "provision" => r.permissions.provision,
            "checks" => r.permissions.checks,
            "integrate" => r.permissions.integrate,
            _ => false,
        };
        if !allowed || r.state == "cancelled" {
            return Err(format!("{kind} permission is revoked"));
        }
        if let Some(id) = area {
            if !b
                .tasks
                .iter()
                .any(|t| r.tasks.contains(&t.id) && t.checkout_ref.as_deref() == Some(id))
            {
                return Err("Checkout outside run scope".into());
            }
        }
        if let Some(repo) = repository {
            let actual = std::fs::canonicalize(repo).map_err(|e| e.to_string())?;
            if !r.plan.as_ref().is_some_and(|p| {
                p.repositories
                    .iter()
                    .any(|p| std::fs::canonicalize(p).ok().as_ref() == Some(&actual))
            }) {
                return Err("Repository outside adopted provisioning allowlist".into());
            }
        }
        Ok(())
    }
    pub fn team_check(
        &self,
        workspace: &str,
        run_id: &str,
        id: &str,
    ) -> Result<(crate::orchestrator::Check, String, String), String> {
        self.team_authority(workspace, run_id, "checks", None, None)?;
        let mut s = self.state.lock().map_err(|_| "Team unavailable")?;
        let b = task_store(&mut s)?.snapshot().board;
        let r = b
            .orchestration
            .as_ref()
            .filter(|r| r.id == run_id)
            .ok_or("Run changed")?;
        let check = r
            .plan
            .as_ref()
            .and_then(|p| p.checks.iter().find(|c| c.id == id))
            .cloned()
            .ok_or("Check not declared in adopted plan")?;
        let t = b
            .tasks
            .iter()
            .find(|t| t.id == check.task)
            .ok_or("Check task unavailable")?;
        let area = t
            .checkout_ref
            .as_deref()
            .ok_or("Check needs a managed checkout")?;
        let review = crate::areas::review(&s.folder, area)?;
        if !review.status.is_empty() {
            return Err("Commit and clean the checkout before checks".into());
        }
        Ok((check, crate::areas::checkout(&s.folder, area)?, review.head))
    }
    pub fn team_event(
        &self,
        workspace: &str,
        run_id: &str,
        kind: &str,
        detail: &str,
    ) -> Result<(), String> {
        let mut s = self.state.lock().map_err(|_| "Team unavailable")?;
        if s.workspace != workspace {
            return Err("Workspace changed".into());
        }
        task_store(&mut s)?.run_event(run_id, kind, detail, task_now())
    }
}

#[cfg(test)]
mod validation_tests {
    use super::*;

    #[test]
    fn unlocked_validation_keeps_inbox_live_and_rejects_stale_authority() {
        let root = std::env::current_dir()
            .unwrap()
            .join("target")
            .join(format!(
                "team-validation-{}",
                crate::orchestrator::uuid().unwrap()
            ));
        std::fs::create_dir_all(&root).unwrap();
        let service = Collaboration::new(Arc::new(crate::pty::PtyManager::default())).unwrap();
        {
            let mut s = service.state.lock().unwrap();
            s.workspace = "fixture".into();
            s.folder = root.clone();
            s.live.insert("worker".into(), "fixture-token".into());
            s.generations
                .insert("worker".into(), "generation-one".into());
        }
        let validation = Collaboration::validation(&mut service.state.lock().unwrap()).unwrap();
        // This is the interval in which Git validation runs. The real cooperative
        // protocol can read the inbox without waiting for that validation to end.
        let reply = service.handle(Request {
            version: 1,
            request_id: crate::orchestrator::uuid().unwrap(),
            node_id: "worker".into(),
            token: "fixture-token".into(),
            op: "task".into(),
            payload: Some(r#"{"type":"inbox","after":null}"#.into()),
            target_id: None,
            enter: false,
            message_id: None,
        });
        assert!(reply.ok, "{:?}", reply.error);
        let mut s = service.state.lock().unwrap();
        assert!(Collaboration::validation_current(&mut s, &validation).unwrap());
        // A new attempt/result or permission change must invalidate old inputs.
        task_store(&mut s)
            .unwrap()
            .control(
                validation.board.revision,
                Control::New {
                    id: crate::orchestrator::uuid().unwrap(),
                    goal: "New authority".into(),
                    coordinator: None,
                    limits: Default::default(),
                    permissions: Default::default(),
                },
                &HashMap::new(),
                task_now(),
                &HashMap::new(),
            )
            .unwrap();
        assert!(!Collaboration::validation_current(&mut s, &validation).unwrap());
        let validation = Collaboration::validation(&mut s).unwrap();
        s.generations
            .insert("worker".into(), "generation-two".into());
        assert!(!Collaboration::validation_current(&mut s, &validation).unwrap());
        let validation = Collaboration::validation(&mut s).unwrap();
        s.live.remove("worker");
        assert!(!Collaboration::validation_current(&mut s, &validation).unwrap());
        let validation = Collaboration::validation(&mut s).unwrap();
        s.closing_nodes.insert("worker".into());
        assert!(!Collaboration::validation_current(&mut s, &validation).unwrap());
        let validation = Collaboration::validation(&mut s).unwrap();
        s.workspace = "other".into();
        assert!(!Collaboration::validation_current(&mut s, &validation).unwrap());
        drop(s);
        drop(service);
        assert_eq!(
            root.parent(),
            Some(std::env::current_dir().unwrap().join("target").as_path())
        );
        assert!(root
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("team-validation-"));
        std::fs::remove_dir_all(root).unwrap();
    }
}
