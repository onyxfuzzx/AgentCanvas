use crate::{
    pty::PtyManager,
    workspace::{Edge, Layout, Node},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Instant, SystemTime, UNIX_EPOCH},
};

pub const MAX_FRAME: usize = 65536;
const MAX_MESSAGE: usize = 8192;
#[derive(Deserialize, Serialize, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    pub version: u8,
    pub request_id: String,
    pub node_id: String,
    pub token: String,
    pub op: String,
    #[serde(default)]
    pub target_id: Option<String>,
    #[serde(default)]
    pub payload: Option<String>,
    #[serde(default)]
    pub enter: bool,
    #[serde(default)]
    pub message_id: Option<u64>,
}
#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Reply {
    pub request_id: String,
    pub ok: bool,
    pub result: Value,
    pub error: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Log {
    pub workspace_id: String,
    pub id: u64,
    pub edge_id: String,
    pub source: String,
    pub target: String,
    pub source_title: String,
    pub target_title: String,
    pub text: String,
    pub enter: bool,
    pub operation: String,
    pub status: String,
    pub at: u64,
}
struct Pending {
    source_token: String,
    target_token: String,
}
struct Delivery {
    id: u64,
    write: Box<dyn FnOnce(Vec<u8>) -> Result<(), String> + Send>,
    data: Vec<u8>,
    auth: Pending,
}
struct Bucket {
    tokens: f64,
    updated: Instant,
}
impl Bucket {
    fn take(&mut self) -> bool {
        self.tokens = (self.tokens + self.updated.elapsed().as_secs_f64() * 2.0).min(5.0);
        self.updated = Instant::now();
        if self.tokens < 1.0 {
            false
        } else {
            self.tokens -= 1.0;
            true
        }
    }
}
#[derive(Default)]
struct State {
    tasks: Option<crate::tasks::Store>,
    generations: HashMap<String, String>,
    closing_nodes: HashSet<String>,
    folder: PathBuf,
    workspace: String,
    nodes: HashMap<String, Node>,
    edges: Vec<Edge>,
    live: HashMap<String, String>,
    logs: VecDeque<Log>,
    pending: HashMap<u64, Pending>,
    buckets: HashMap<String, Bucket>,
    sequence: u64,
    revision: u64,
    in_flight: usize,
    deliveries: HashMap<String, VecDeque<Delivery>>,
    delivery_workers: HashSet<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    revision: u64,
    logs: Vec<Log>,
    live_nodes: Vec<String>,
}
pub struct Collaboration {
    state: Arc<Mutex<State>>,
    pty: Arc<PtyManager>,
    pub pipe: String,
}
fn same_secret(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |n, (a, b)| n | (a ^ b)) == 0
}
fn task_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn task_store(s: &mut State) -> Result<&mut crate::tasks::Store, String> {
    if s.tasks.is_none() {
        s.tasks = Some(crate::tasks::Store::open(&s.folder)?);
    }
    Ok(s.tasks.as_mut().unwrap())
}
fn delivery_worker(state: Arc<Mutex<State>>, target: String) {
    loop {
        let delivery = {
            let Ok(mut s) = state.lock() else {
                return;
            };
            let Some(delivery) = s.deliveries.get_mut(&target).and_then(VecDeque::pop_front) else {
                s.delivery_workers.remove(&target);
                s.deliveries.remove(&target);
                return;
            };
            let log = s.logs.iter().find(|l| l.id == delivery.id).cloned();
            let authorized = log.as_ref().is_some_and(|log| {
                log.status == "queued"
                    && s.edge(&log.source, &log.target).is_ok()
                    && s.live.get(&log.source) == Some(&delivery.auth.source_token)
                    && s.live.get(&log.target) == Some(&delivery.auth.target_token)
            });
            if !authorized {
                s.in_flight -= 1;
                s.status(delivery.id, "cancelled");
                continue;
            }
            s.status(delivery.id, "delivering");
            delivery
        };
        let result = (delivery.write)(delivery.data);
        if let Ok(mut s) = state.lock() {
            s.in_flight -= 1;
            s.status(
                delivery.id,
                if result.is_ok() {
                    "delivered"
                } else {
                    "failed"
                },
            );
        } else {
            return;
        }
    }
}
impl State {
    fn cancel(&mut self, predicate: impl Fn(&Log) -> bool) {
        let mut cancelled = HashSet::new();
        for log in &mut self.logs {
            if (log.status == "pending" || log.status == "queued") && predicate(log) {
                log.status = "cancelled".into();
                self.pending.remove(&log.id);
                cancelled.insert(log.id);
            }
        }
        for queue in self.deliveries.values_mut() {
            let before = queue.len();
            queue.retain(|d| !cancelled.contains(&d.id));
            self.in_flight -= before - queue.len();
        }
        self.revision += 1;
    }
    fn trim(&mut self) {
        while self.logs.len() > 200
            || self.logs.iter().map(|l| l.text.len()).sum::<usize>() > 512 * 1024
        {
            if let Some(index) = self.logs.iter().position(|l| {
                l.status != "pending" && l.status != "delivering" && l.status != "queued"
            }) {
                self.logs.remove(index);
            } else {
                break;
            }
        }
    }
    fn log(
        &mut self,
        edge: &Edge,
        route: (&str, &str),
        text: String,
        enter: bool,
        operation: &str,
        status: &str,
    ) -> u64 {
        let (source, target) = route;
        self.sequence += 1;
        let id = self.sequence;
        self.logs.push_back(Log {
            workspace_id: self.workspace.clone(),
            id,
            edge_id: edge.id.clone(),
            source: source.into(),
            target: target.into(),
            source_title: self
                .nodes
                .get(source)
                .map(|n| n.title.clone())
                .unwrap_or_default(),
            target_title: self
                .nodes
                .get(target)
                .map(|n| n.title.clone())
                .unwrap_or_default(),
            text,
            enter,
            operation: operation.into(),
            status: status.into(),
            at: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        });
        self.revision += 1;
        self.trim();
        id
    }
    fn status(&mut self, id: u64, status: &str) {
        if let Some(log) = self.logs.iter_mut().find(|l| l.id == id) {
            log.status = status.into();
        }
        self.pending.remove(&id);
        self.revision += 1;
        self.trim();
    }
    fn edge(&self, source: &str, target: &str) -> Result<Edge, String> {
        self.edges
            .iter()
            .find(|e| {
                e.kind == "agent"
                    && ((e.source == source && e.target == target)
                        || (e.source == target && e.target == source))
            })
            .cloned()
            .ok_or_else(|| "NOT_LINKED: no live agent connection".into())
    }
}
impl Collaboration {
    pub fn new(pty: Arc<PtyManager>) -> Result<Self, String> {
        Ok(Self {
            state: Arc::new(Mutex::new(State::default())),
            pty,
            pipe: format!(r"\\.\pipe\agentcanvas-{}", crate::ipc::random_secret()?),
        })
    }
    pub fn configure(
        &self,
        workspace: &str,
        mut layout: Layout,
        folder: &Path,
    ) -> Result<(), String> {
        for node in &mut layout.nodes {
            if node.kind == "terminal" && node.cwd.as_deref().is_none_or(|s| s.trim().is_empty()) {
                node.cwd = Some(crate::workspace::display(folder));
            }
        }
        layout.validate()?;
        let mut note_paths: HashMap<&str, Vec<String>> = HashMap::new();
        for edge in layout.edges.iter().filter(|e| e.kind == "memory") {
            let node = layout
                .nodes
                .iter()
                .find(|n| n.id == edge.source)
                .ok_or("Note unavailable")?;
            let path = crate::notes::resolve_in_folder(
                folder,
                node.relative_path.as_deref().ok_or("Missing note path")?,
            )?;
            note_paths
                .entry(&edge.target)
                .or_default()
                .push(crate::workspace::display(&path));
        }
        for paths in note_paths.values() {
            if serde_json::to_vec(paths).map_err(|e| e.to_string())?.len() > 16384 {
                return Err("A terminal's shared-note path list is limited to 16 KiB; remove some note links".into());
            }
        }
        let mut state = self.state.lock().map_err(|_| "Collaboration unavailable")?;
        if state.workspace != workspace {
            state.tasks = None;
            state.generations.clear();
            state.cancel(|_| true);
            state.live.clear();
            state.buckets.clear();
        }
        let changed: Vec<String> = state
            .edges
            .iter()
            .filter(|old| !layout.edges.contains(old))
            .map(|e| e.id.clone())
            .collect();
        state.cancel(|log| changed.contains(&log.edge_id));
        state.workspace = workspace.into();
        state.folder = folder.to_owned();
        state.nodes = layout
            .nodes
            .into_iter()
            .map(|n| (n.id.clone(), n))
            .collect();
        state.edges = layout.edges;
        let terminal_ids: Vec<_> = state
            .nodes
            .values()
            .filter(|n| n.kind == "terminal")
            .map(|n| n.id.clone())
            .collect();
        state.live.retain(|id, _| terminal_ids.contains(id));
        state.generations.retain(|id, _| terminal_ids.contains(id));
        let edges = state.edges.clone();
        state.buckets.retain(|id, _| {
            if let Some(node) = id.strip_prefix("task:") {
                terminal_ids.iter().any(|id| id == node)
            } else {
                edges.iter().any(|e| e.id == *id)
            }
        });
        state.revision += 1;
        Ok(())
    }
    pub fn attach(&self, id: &str) -> Result<Vec<(String, String)>, String> {
        let mut s = self.state.lock().map_err(|_| "Collaboration unavailable")?;
        if s.closing_nodes.contains(id) {
            return Err("Terminal is still shutting down".into());
        }
        if !s.nodes.get(id).is_some_and(|n| n.kind == "terminal") {
            return Err("Sync the workspace before starting this terminal".into());
        }
        let token = crate::ipc::random_secret()?;
        let peers: Vec<_> = s
            .edges
            .iter()
            .filter(|e| e.kind == "agent" && (e.source == id || e.target == id))
            .map(|e| {
                if e.source == id {
                    e.target.clone()
                } else {
                    e.source.clone()
                }
            })
            .collect();
        let paths: Vec<_> = s
            .edges
            .iter()
            .filter(|e| e.kind == "memory" && e.target == id)
            .map(|e| {
                crate::notes::resolve_in_folder(
                    &s.folder,
                    s.nodes[&e.source]
                        .relative_path
                        .as_deref()
                        .ok_or("Missing note path")?,
                )
                .map(|p| crate::workspace::display(&p))
            })
            .collect::<Result<Vec<_>, _>>()?;
        let helper = std::env::current_exe()
            .map_err(|e| e.to_string())?
            .parent()
            .ok_or("Executable folder unavailable")?
            .to_owned();
        let mut wslenv = std::env::var("WSLENV").unwrap_or_default();
        for name in [
            "AGENTCANVAS_NODE_ID",
            "AGENTCANVAS_PIPE",
            "AGENTCANVAS_TOKEN",
            "AGENTCANVAS_PEERS",
            "AGENTCANVAS_NOTE_PATHS",
        ] {
            if !wslenv.split(':').any(|v| v.split('/').next() == Some(name)) {
                if !wslenv.is_empty() {
                    wslenv.push(':');
                }
                wslenv.push_str(name);
            }
        }
        let environment = vec![
            ("AGENTCANVAS_PIPE".into(), self.pipe.clone()),
            ("AGENTCANVAS_TOKEN".into(), token.clone()),
            (
                "AGENTCANVAS_PEERS".into(),
                serde_json::to_string(&peers).map_err(|e| e.to_string())?,
            ),
            (
                "AGENTCANVAS_NOTE_PATHS".into(),
                serde_json::to_string(&paths).map_err(|e| e.to_string())?,
            ),
            (
                "PATH".into(),
                format!(
                    "{};{}",
                    helper.display(),
                    std::env::var("PATH").unwrap_or_default()
                ),
            ),
            ("WSLENV".into(), wslenv),
        ];
        s.cancel(|log| log.source == id || log.target == id);
        s.live.insert(id.into(), token);
        let random = crate::ipc::random_secret()?;
        s.generations.insert(
            id.into(),
            format!(
                "{}-{}-{}-{}-{}",
                &random[..8],
                &random[8..12],
                &random[12..16],
                &random[16..20],
                &random[20..32]
            ),
        );
        Ok(environment)
    }
    pub fn detach(&self, id: &str) {
        if let Ok(mut s) = self.state.lock() {
            s.closing_nodes.remove(id);
            s.live.remove(id);
            s.generations.remove(id);
            s.cancel(|l| l.source == id || l.target == id);
        }
    }
    pub fn begin_close(&self, id: &str) -> Result<(), String> {
        if !crate::workspace::id_valid(id) {
            return Err("Invalid terminal ID".into());
        }
        let mut s = self.state.lock().map_err(|_| "Collaboration unavailable")?;
        if !s.closing_nodes.insert(id.into()) {
            return Err("Terminal is already shutting down".into());
        }
        s.live.remove(id);
        s.generations.insert(id.into(), "stopping".into());
        s.cancel(|l| l.source == id || l.target == id);
        Ok(())
    }
    pub fn generation(&self, id: &str) -> Option<String> {
        self.state.lock().ok()?.generations.get(id).cloned()
    }
    pub fn process_exited(&self, id: &str, generation: &str) {
        if let Ok(mut s) = self.state.lock() {
            if !s.live.contains_key(id)
                || s.generations.get(id).map(String::as_str) != Some(generation)
                || s.closing_nodes.contains(id)
            {
                return;
            }
            s.live.remove(id);
            s.generations
                .insert(id.into(), "exited; close terminal before resolving".into());
            s.cancel(|l| l.source == id || l.target == id);
        }
    }
    pub fn snapshot(&self, after: u64) -> Result<Option<Snapshot>, String> {
        let s = self.state.lock().map_err(|_| "Collaboration unavailable")?;
        Ok((s.revision != after).then(|| Snapshot {
            revision: s.revision,
            logs: s.logs.iter().cloned().collect(),
            live_nodes: s.live.keys().cloned().collect(),
        }))
    }
    pub fn task_snapshot(&self, workspace: &str) -> Result<crate::tasks::Snapshot, String> {
        let mut s = self.state.lock().map_err(|_| "Collaboration unavailable")?;
        if s.workspace != workspace || workspace.is_empty() {
            return Err("Workspace is no longer active".into());
        }
        let live = s.generations.clone();
        let tasks = task_store(&mut s)?;
        tasks.reconcile(&live, task_now())?;
        Ok(tasks.snapshot())
    }
    pub fn task_action(
        &self,
        workspace: &str,
        request_id: &str,
        revision: u64,
        action: crate::tasks::Action,
    ) -> Result<crate::tasks::Snapshot, String> {
        let mut s = self.state.lock().map_err(|_| "Collaboration unavailable")?;
        if s.workspace != workspace || workspace.is_empty() {
            return Err("Workspace is no longer active".into());
        }
        let live = s.generations.clone();
        let tasks = task_store(&mut s)?;
        tasks.reconcile(&live, task_now())?;
        if tasks.user_replayed(request_id, &action)? {
            return Ok(tasks.snapshot());
        }
        let assigned = match &action {
            crate::tasks::Action::Create { assigned_to, .. }
            | crate::tasks::Action::Edit { assigned_to, .. } => Some(assigned_to),
            _ => None,
        };
        if assigned.is_some_and(|id| !s.nodes.get(id).is_some_and(|n| n.kind == "terminal")) {
            return Err("Choose an existing terminal or agent".into());
        }
        if let crate::tasks::Action::Dispatch { id, .. }
        | crate::tasks::Action::Resolve { id, .. } = &action
        {
            let task = task_store(&mut s)?
                .snapshot()
                .board
                .tasks
                .into_iter()
                .find(|t| &t.id == id)
                .ok_or("Task unavailable")?;
            if matches!(&action, crate::tasks::Action::Dispatch { .. }) {
                if !s.live.contains_key(&task.assigned_to)
                    || !self.pty.has_session(&task.assigned_to)?
                {
                    return Err("Start the assigned terminal before dispatch".into());
                }
            } else if task.attempts.last().is_some_and(|a| {
                matches!(
                    a.state,
                    crate::tasks::AttemptStatus::Dispatched
                        | crate::tasks::AttemptStatus::Acknowledged
                        | crate::tasks::AttemptStatus::Running
                        | crate::tasks::AttemptStatus::Cancelling
                        | crate::tasks::AttemptStatus::Interrupted
                )
            }) && (s.closing_nodes.contains(&task.assigned_to)
                || self.pty.has_session(&task.assigned_to)?)
            {
                return Err(
                    "Wait for the assigned terminal to stop before resolving uncertain work".into(),
                );
            }
        }
        let live = s.generations.clone();
        let tasks = task_store(&mut s)?;
        tasks.execute(
            crate::tasks::Actor::User,
            request_id,
            Some(revision),
            action,
            &live,
            task_now(),
        )?;
        Ok(tasks.snapshot())
    }
    fn deliver(&self, s: &mut State, id: u64) -> Result<(), String> {
        let log = s
            .logs
            .iter()
            .find(|l| l.id == id)
            .cloned()
            .ok_or("Message expired")?;
        let pending = s.pending.get(&id).ok_or("Message is no longer pending")?;
        if s.edge(&log.source, &log.target).is_err()
            || s.live.get(&log.source) != Some(&pending.source_token)
            || s.live.get(&log.target) != Some(&pending.target_token)
        {
            s.status(id, "cancelled");
            return Err("Message was revoked by a link or process change".into());
        }
        let mut data = log.text.replace('\n', "\r").into_bytes();
        if log.enter {
            data.push(b'\r');
        }
        if s.in_flight >= 20 {
            return Err("At most 20 peer deliveries may be in progress".into());
        }
        let input = match self.pty.peer_input(&log.target) {
            Ok(input) => input,
            Err(error) => {
                s.status(id, "failed");
                return Err(error);
            }
        };
        let auth = Pending {
            source_token: pending.source_token.clone(),
            target_token: pending.target_token.clone(),
        };
        s.status(id, "queued");
        s.in_flight += 1;
        // Authorization and process selection are atomic under this lock.
        // The actual bounded write never holds the graph lock: a blocked
        // shell cannot prevent link revocation, node close or app shutdown.
        s.deliveries
            .entry(log.target.clone())
            .or_default()
            .push_back(Delivery {
                id,
                write: Box::new(move |data| input.write(data)),
                data,
                auth,
            });
        if s.delivery_workers.insert(log.target.clone()) {
            let state = self.state.clone();
            let target = log.target.clone();
            if let Err(error) = std::thread::Builder::new()
                .name("peer-delivery".into())
                .spawn(move || delivery_worker(state, target))
            {
                s.delivery_workers.remove(&log.target);
                if let Some(queue) = s.deliveries.remove(&log.target) {
                    for d in queue {
                        s.in_flight -= 1;
                        s.status(d.id, "failed");
                    }
                }
                return Err(error.to_string());
            }
        }
        Ok(())
    }
    pub fn decide(&self, id: u64, allow: bool) -> Result<(), String> {
        let mut s = self.state.lock().map_err(|_| "Collaboration unavailable")?;
        if !s.pending.contains_key(&id) {
            return Err("Message is no longer pending".into());
        }
        if allow {
            self.deliver(&mut s, id)
        } else {
            s.status(id, "rejected");
            Ok(())
        }
    }
    pub fn handle(&self, request: Request) -> Reply {
        let result = self.process(&request);
        match result {
            Ok(value) => Reply {
                request_id: request.request_id,
                ok: true,
                result: value,
                error: None,
            },
            Err(error) => Reply {
                request_id: request.request_id,
                ok: false,
                result: Value::Null,
                error: Some(error),
            },
        }
    }
    fn process(&self, r: &Request) -> Result<Value, String> {
        if r.version != 1 || r.request_id.len() > 80 || r.request_id.is_empty() {
            return Err("PROTOCOL: unsupported version or request ID".into());
        }
        let mut s = self.state.lock().map_err(|_| "Collaboration unavailable")?;
        if !s
            .live
            .get(&r.node_id)
            .is_some_and(|token| same_secret(token, &r.token))
        {
            return Err("UNAUTHORIZED: node token is invalid or expired".into());
        }
        match r.op.as_str() {
            "task" => {
                let key = format!("task:{}", r.node_id);
                if !s.buckets.entry(key).or_insert(Bucket{tokens:5.0,updated:Instant::now()}).take() { return Err("RATE_LIMIT: task requests allow five burst, two per second".into()); }
                let payload = r.payload.as_deref().ok_or("Missing task action JSON")?;
                if payload.len() > 8192 {return Err("Task action exceeds 8192 bytes".into());}
                let action = serde_json::from_str(payload).map_err(|e|format!("Invalid task action: {e}"))?;
                let generation = s.generations.get(&r.node_id).ok_or("Task generation expired")?.clone();
                let live = s.generations.clone();
                task_store(&mut s)?.execute(crate::tasks::Actor::Agent {node:&r.node_id,generation:&generation}, &r.request_id, None, action, &live, task_now())
            },
            "peers"=>Ok(json!(s.edges.iter().filter(|e|e.kind=="agent"&&(e.source==r.node_id||e.target==r.node_id)).map(|e|{let id=if e.source==r.node_id{&e.target}else{&e.source};json!({"id":id,"title":s.nodes[id].title,"running":s.live.contains_key(id),"policy":e.policy})}).collect::<Vec<_>>())),
            "notes"=>{
                let mut notes=Vec::new();
                for edge in s.edges.iter().filter(|e|e.kind=="memory"&&e.target==r.node_id){
                    let node=&s.nodes[&edge.source];
                    let path=crate::notes::resolve_in_folder(&s.folder,node.relative_path.as_deref().ok_or("Missing note path")?)?;
                    notes.push(json!({"id":edge.source,"title":node.title,"path":crate::workspace::display(&path)}));
                }
                Ok(json!(notes))
            },
            "status"=>{let id=r.message_id.ok_or("Missing message ID")?;let log=s.logs.iter().find(|l|l.id==id&&l.source==r.node_id).ok_or("Message unavailable")?;Ok(json!({"id":id,"status":log.status}))},
            "send"|"readRecent"=>{
                let target=r.target_id.as_deref().ok_or("Missing target ID")?;
                let edge=s.edge(&r.node_id,target)?;
                let text=if r.op=="send"{r.payload.as_deref().ok_or("Missing message text")?}else{"Read recent output"};
                if text.len()>MAX_MESSAGE||text.is_empty()||text.chars().any(|c|c.is_control()&&c!='\n'&&c!='\t'){s.log(&edge,(&r.node_id,target),format!("Rejected invalid payload ({} bytes)",text.len()),r.enter,&r.op,"rejected");return Err("INVALID_TEXT: use 1-8192 UTF-8 bytes without control characters (tab/newline allowed)".into());}
                if !s.buckets.entry(edge.id.clone()).or_insert(Bucket{tokens:5.0,updated:Instant::now()}).take(){s.log(&edge,(&r.node_id,target),text.into(),r.enter,&r.op,"rate_limited");return Err("RATE_LIMIT: this link allows a burst of five requests and two per second".into());}
                if !s.live.contains_key(target){s.log(&edge,(&r.node_id,target),text.into(),r.enter,&r.op,"failed");return Err("TARGET_OFFLINE: restart the peer terminal".into());}
                if r.op=="readRecent" {
                    let result=self.pty.recent(target,8192);
                    s.log(&edge,(&r.node_id,target),"Read up to 8192 bytes of recent output".into(),false,"readRecent",if result.is_ok(){"read"}else{"failed"});
                    return result.map(|text|json!({"text":text}));
                }
                if s.pending.len()>=20 {s.log(&edge,(&r.node_id,target),text.into(),r.enter,"send","rejected");return Err("QUEUE_FULL: at most 20 messages may await approval".into());}
                let pending=Pending{source_token:s.live[&r.node_id].clone(),target_token:s.live[target].clone()};
                let id=s.log(&edge,(&r.node_id,target),text.into(),r.enter,"send","pending");s.pending.insert(id,pending);
                if edge.policy=="auto" {self.deliver(&mut s,id)?;}
                Ok(json!({"id":id,"status":if edge.policy=="auto"{"queued"}else{"pending"}}))
            }
            _=>Err("UNKNOWN_OPERATION".into()),
        }
    }
}
#[cfg(test)]
mod queue_tests {
    use super::*;
    use std::sync::mpsc;
    fn state() -> Arc<Mutex<State>> {
        let mut s = State::default();
        s.edges.push(Edge {
            id: "edge".into(),
            source: "a".into(),
            target: "b".into(),
            kind: "agent".into(),
            policy: "auto".into(),
        });
        s.live.insert("a".into(), "a-token".into());
        s.live.insert("b".into(), "b-token".into());
        s.delivery_workers.insert("b".into());
        Arc::new(Mutex::new(s))
    }
    fn enqueue(
        state: &Arc<Mutex<State>>,
        write: impl FnOnce(Vec<u8>) -> Result<(), String> + Send + 'static,
    ) -> u64 {
        let mut s = state.lock().unwrap();
        let edge = s.edges[0].clone();
        let id = s.log(&edge, ("a", "b"), "text".into(), false, "send", "queued");
        s.in_flight += 1;
        s.deliveries
            .entry("b".into())
            .or_default()
            .push_back(Delivery {
                id,
                write: Box::new(write),
                data: vec![1],
                auth: Pending {
                    source_token: "a-token".into(),
                    target_token: "b-token".into(),
                },
            });
        id
    }
    #[test]
    fn delivery_queue_preserves_order_and_releases_workers() {
        let state = state();
        let order = Arc::new(Mutex::new(Vec::new()));
        for value in [1, 2, 3] {
            let order = order.clone();
            enqueue(&state, move |_| {
                order.lock().unwrap().push(value);
                Ok(())
            });
        }
        delivery_worker(state.clone(), "b".into());
        assert_eq!(*order.lock().unwrap(), [1, 2, 3]);
        let s = state.lock().unwrap();
        assert_eq!(s.in_flight, 0);
        assert!(s.delivery_workers.is_empty());
    }
    #[test]
    fn blocked_write_does_not_lock_graph_and_revocation_cancels_queued_work() {
        let state = state();
        let (started, ready) = mpsc::sync_channel(1);
        let (release, blocked) = mpsc::sync_channel(1);
        enqueue(&state, move |_| {
            started.send(()).unwrap();
            blocked.recv().unwrap();
            Ok(())
        });
        let second = enqueue(&state, |_| panic!("revoked message must not be written"));
        let worker_state = state.clone();
        let worker = std::thread::spawn(move || delivery_worker(worker_state, "b".into()));
        ready
            .recv_timeout(std::time::Duration::from_secs(2))
            .unwrap();
        {
            let mut s = state
                .try_lock()
                .expect("OS writes must not hold the graph lock");
            s.cancel(|l| l.id == second);
            assert_eq!(s.in_flight, 1);
        }
        release.send(()).unwrap();
        worker.join().unwrap();
        let s = state.lock().unwrap();
        assert_eq!(
            s.logs.iter().find(|l| l.id == second).unwrap().status,
            "cancelled"
        );
        assert_eq!(s.in_flight, 0);
    }
    #[test]
    fn queued_delivery_rechecks_process_generation_before_write() {
        let state = state();
        enqueue(&state, |_| {
            panic!("stale process generation must not be written")
        });
        state
            .lock()
            .unwrap()
            .live
            .insert("b".into(), "replacement-token".into());
        delivery_worker(state.clone(), "b".into());
        assert_eq!(state.lock().unwrap().logs[0].status, "cancelled");
    }
}
