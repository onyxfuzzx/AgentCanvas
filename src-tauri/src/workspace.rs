use crate::atomic_file::{self, Lock};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
};

const MAX_BYTES: u64 = 4 * 1024 * 1024;
const LAYOUT: &str = "workspace.json";
const BACKUP: &str = "workspace.json.bak";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Viewport {
    pub x: f64,
    pub y: f64,
    pub zoom: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub snap_grid: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Node {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub color: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub z: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shell: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Layout {
    pub nodes: Vec<Node>,
    pub viewport: Viewport,
    pub settings: Settings,
    pub edges: Vec<serde_json::Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Document {
    pub version: u32,
    pub id: String,
    pub name: String,
    pub revision: u64,
    pub nodes: Vec<Node>,
    pub viewport: Viewport,
    pub settings: Settings,
    pub edges: Vec<serde_json::Value>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Entry {
    pub id: String,
    pub name: String,
    pub folder: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Catalog {
    pub version: u32,
    pub entries: Vec<Entry>,
    pub last_active: Option<String>,
}
impl Default for Catalog {
    fn default() -> Self {
        Self {
            version: 1,
            entries: Vec::new(),
            last_active: None,
        }
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogReply {
    pub entries: Vec<Entry>,
    pub last_active: Option<String>,
    pub recovered: bool,
    pub default_folder: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct Loaded {
    pub document: Document,
    pub folder: String,
    pub recovered: bool,
}

struct OpenWorkspace {
    folder: PathBuf,
    document: Document,
    baseline: Option<Vec<u8>>,
    good: Vec<u8>,
    recovered: bool,
    _lock: Lock,
}
pub struct WorkspaceStore {
    base: PathBuf,
    home: PathBuf,
    open: HashMap<String, OpenWorkspace>,
}

fn id_valid(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(i, c)| {
            if [8, 13, 18, 23].contains(&i) {
                c == b'-'
            } else {
                c.is_ascii_hexdigit()
            }
        })
}
fn name_valid(name: &str) -> bool {
    !name.trim().is_empty() && name.chars().count() <= 80 && !name.contains('\0')
}
fn bounded(number: f64, limit: f64) -> bool {
    number.is_finite() && number.abs() <= limit
}
fn path_valid(path: &str) -> bool {
    path.len() <= 32768 && !path.contains('\0') && Path::new(path).is_absolute()
}
fn display(path: &Path) -> String {
    let value = path.to_string_lossy();
    if let Some(tail) = value.strip_prefix("\\\\?\\UNC\\") {
        format!("\\\\{tail}")
    } else {
        value.strip_prefix("\\\\?\\").unwrap_or(&value).to_owned()
    }
}
fn read(path: &Path) -> Result<Option<Vec<u8>>, String> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    if file.metadata().map_err(|e| e.to_string())?.len() > MAX_BYTES {
        return Err("Workspace file exceeds 4 MiB".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("Workspace file exceeds 4 MiB".into());
    }
    Ok(Some(bytes))
}
fn encode<T: Serialize>(value: &T) -> Result<Vec<u8>, String> {
    serde_json::to_vec_pretty(value).map_err(|e| e.to_string())
}

impl Layout {
    fn validate(&self) -> Result<(), String> {
        if !bounded(self.viewport.x, 1e9)
            || !bounded(self.viewport.y, 1e9)
            || !(0.25..=2.0).contains(&self.viewport.zoom)
        {
            return Err("Invalid workspace viewport".into());
        }
        if self.nodes.len() > 500 || !self.edges.is_empty() {
            return Err("This version supports at most 500 nodes and no connections".into());
        }
        let mut ids = HashSet::new();
        let mut terminals = 0;
        for n in &self.nodes {
            if !id_valid(&n.id)
                || !ids.insert(&n.id)
                || n.title.chars().count() > 80
                || n.title.contains('\0')
                || n.color.len() != 7
                || !n.color.starts_with('#')
                || !n.color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
            {
                return Err("Invalid or duplicate workspace node metadata".into());
            }
            if !bounded(n.x, 1e7)
                || !bounded(n.y, 1e7)
                || !(320.0..=10000.0).contains(&n.width)
                || !(200.0..=10000.0).contains(&n.height)
                || !(0..=1_000_000_000).contains(&n.z)
            {
                return Err("Invalid node geometry".into());
            }
            match n.kind.as_str() {
                "card" if n.shell.is_none() && n.cwd.is_none() => {}
                "terminal" => {
                    terminals += 1;
                    if !matches!(
                        n.shell.as_deref(),
                        Some("powershell" | "cmd" | "wsl" | "git-bash")
                    ) || !n.cwd.as_deref().is_some_and(path_valid)
                    {
                        return Err("Invalid saved terminal preset or directory".into());
                    }
                }
                _ => return Err("Unsupported node kind or payload; file was not changed".into()),
            }
        }
        if terminals > 20 {
            return Err("A workspace supports at most 20 terminals".into());
        }
        Ok(())
    }
}
impl Document {
    fn layout(&self) -> Layout {
        Layout {
            nodes: self.nodes.clone(),
            viewport: self.viewport.clone(),
            settings: self.settings.clone(),
            edges: self.edges.clone(),
        }
    }
    fn validate(&self) -> Result<(), String> {
        if self.version != 1 {
            return Err(format!(
                "Unsupported workspace version {}; file was not changed",
                self.version
            ));
        }
        if !id_valid(&self.id) || !name_valid(&self.name) {
            return Err("Invalid workspace identity".into());
        }
        self.layout().validate()
    }
}
fn decode(bytes: &[u8]) -> Result<Document, String> {
    let doc: Document =
        serde_json::from_slice(bytes).map_err(|e| format!("Invalid workspace JSON: {e}"))?;
    doc.validate()?;
    Ok(doc)
}

impl WorkspaceStore {
    pub fn new(base: PathBuf, home: PathBuf) -> Self {
        Self {
            base,
            home,
            open: HashMap::new(),
        }
    }
    fn ensure_base(&self) -> Result<(), String> {
        if !self.base.is_absolute() {
            return Err("App data folder must be absolute".into());
        }
        fs::create_dir_all(&self.base)
            .map_err(|e| format!("Cannot write app data folder {}: {e}", display(&self.base)))
    }
    fn read_catalog(&self) -> Result<(Catalog, Vec<u8>, bool), String> {
        fn parse(bytes: &[u8]) -> Result<Catalog, String> {
            let catalog: Catalog = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
            if catalog.version != 1 || catalog.entries.len() > 100 {
                return Err("Unsupported workspace catalog".into());
            }
            let mut ids = HashSet::new();
            for entry in &catalog.entries {
                if !id_valid(&entry.id)
                    || !name_valid(&entry.name)
                    || !path_valid(&entry.folder)
                    || !ids.insert(&entry.id)
                {
                    return Err("Invalid workspace catalog entries".into());
                }
            }
            Ok(catalog)
        }
        let primary = read(&self.base.join("workspaces.json"))?;
        if let Some(bytes) = &primary {
            if let Ok(catalog) = parse(bytes) {
                return Ok((catalog, bytes.clone(), false));
            }
        }
        if let Some(bytes) = read(&self.base.join("workspaces.json.bak"))? {
            if let Ok(catalog) = parse(&bytes) {
                return Ok((catalog, bytes, true));
            }
        }
        if primary.is_none() && !self.base.join("workspaces.json.bak").exists() {
            let catalog = Catalog::default();
            let bytes = encode(&catalog)?;
            return Ok((catalog, bytes, false));
        }
        Err(format!("The workspace catalog and backup are unreadable in {}. Existing workspace folders were not changed.", display(&self.base)))
    }
    fn update_catalog(
        &self,
        edit: impl FnOnce(&mut Catalog) -> Result<(), String>,
    ) -> Result<(), String> {
        self.ensure_base()?;
        let _lock = Lock::acquire(&self.base.join(".catalog.lock"))?;
        let (mut catalog, good, _) = self.read_catalog()?;
        edit(&mut catalog)?;
        atomic_file::write(&self.base.join("workspaces.json.bak"), &good)?;
        atomic_file::write(&self.base.join("workspaces.json"), &encode(&catalog)?)
    }
    fn register(&self, doc: &Document, folder: &Path) -> Result<(), String> {
        let folder = display(folder);
        self.update_catalog(|catalog| {
            if let Some(entry) = catalog.entries.iter_mut().find(|e| e.id == doc.id) {
                if !entry.folder.eq_ignore_ascii_case(&folder) && Path::new(&entry.folder).exists()
                {
                    return Err("Another folder is registered with the same workspace ID".into());
                }
                entry.folder = folder;
                entry.name = doc.name.clone();
            } else {
                if catalog.entries.len() >= 100 {
                    return Err("Workspace catalog is full (100 folders)".into());
                }
                catalog.entries.push(Entry {
                    id: doc.id.clone(),
                    name: doc.name.clone(),
                    folder,
                });
            }
            Ok(())
        })
    }
    pub fn list(&self) -> Result<CatalogReply, String> {
        let (catalog, _, recovered) = self.read_catalog()?;
        Ok(CatalogReply {
            entries: catalog.entries,
            last_active: catalog.last_active,
            recovered,
            default_folder: display(&self.base.join("workspaces")),
        })
    }
    pub fn create(
        &mut self,
        id: String,
        name: String,
        folder: Option<String>,
    ) -> Result<Loaded, String> {
        if self.open.len() >= 2 {
            return Err("Finish the current workspace switch first".into());
        }
        if !id_valid(&id) || !name_valid(&name) {
            return Err("Use a valid workspace ID and a name of 1–80 characters".into());
        }
        self.ensure_base()?;
        let folder = match folder.filter(|s| !s.trim().is_empty()) {
            Some(path) if path_valid(&path) => PathBuf::from(path),
            Some(_) => return Err("Choose an absolute workspace folder".into()),
            None => self.base.join("workspaces").join(&id),
        };
        fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
        let folder = fs::canonicalize(folder).map_err(|e| e.to_string())?;
        let lock = Lock::acquire(&folder.join(".workspace.lock"))?;
        if folder.join(LAYOUT).exists() || folder.join(BACKUP).exists() {
            return Err("This folder already contains a workspace. Open it instead.".into());
        }
        let doc = Document {
            version: 1,
            id: id.clone(),
            name: name.trim().to_owned(),
            revision: 0,
            nodes: Vec::new(),
            viewport: Viewport {
                x: 72.0,
                y: 72.0,
                zoom: 1.0,
            },
            settings: Settings { snap_grid: false },
            edges: Vec::new(),
        };
        let bytes = encode(&doc)?;
        fs::create_dir_all(folder.join("notes")).map_err(|e| e.to_string())?;
        atomic_file::write(&folder.join(BACKUP), &bytes)?;
        atomic_file::write(&folder.join(LAYOUT), &bytes)?;
        self.register(&doc, &folder)?;
        let loaded = Loaded {
            document: doc.clone(),
            folder: display(&folder),
            recovered: false,
        };
        self.open.insert(
            id,
            OpenWorkspace {
                folder,
                document: doc,
                baseline: Some(bytes.clone()),
                good: bytes,
                recovered: false,
                _lock: lock,
            },
        );
        Ok(loaded)
    }
    pub fn open(&mut self, id: &str) -> Result<Loaded, String> {
        if let Some(open) = self.open.get(id) {
            return Ok(Self::loaded(open));
        }
        let (catalog, _, _) = self.read_catalog()?;
        let entry = catalog
            .entries
            .into_iter()
            .find(|e| e.id == id)
            .ok_or("Workspace is not registered. Open its folder to locate it.")?;
        let loaded = self.open_folder(entry.folder)?;
        if loaded.document.id != id {
            self.release(&loaded.document.id);
            return Err(
                "The workspace identity on disk has changed; the folder was not modified".into(),
            );
        }
        Ok(loaded)
    }
    pub fn open_folder(&mut self, path: String) -> Result<Loaded, String> {
        if !path_valid(&path) {
            return Err("Choose an existing absolute workspace folder".into());
        }
        let folder =
            fs::canonicalize(path).map_err(|e| format!("Workspace folder is unavailable: {e}"))?;
        if let Some(open) = self.open.values().find(|o| o.folder == folder) {
            return Ok(Self::loaded(open));
        }
        if self.open.len() >= 2 {
            return Err("Finish the current workspace switch before opening another folder".into());
        }
        let lock = Lock::acquire(&folder.join(".workspace.lock"))?;
        let baseline = read(&folder.join(LAYOUT))?;
        let parsed = baseline.as_deref().map(decode).transpose();
        let (doc, good, recovered) = match parsed {
            Ok(Some(doc)) => (doc, baseline.clone().unwrap_or_default(), false),
            _ => {
                // Well-formed but unsupported data must never be downgraded
                // to an older backup. Recovery is for truncated/broken JSON.
                if let Some(bytes) = &baseline {
                    if serde_json::from_slice::<serde_json::Value>(bytes).is_ok() {
                        return Err(decode(bytes)
                            .err()
                            .unwrap_or_else(|| "Unsupported workspace data".into()));
                    }
                }
                let good = read(&folder.join(BACKUP))?
                    .ok_or("Layout is missing or corrupt and has no usable backup")?;
                let doc =
                    decode(&good).map_err(|e| format!("Layout and backup are unreadable: {e}"))?;
                (doc, good, true)
            }
        };
        if self.open.contains_key(&doc.id) {
            return Err("Another folder with this workspace ID is already open".into());
        }
        self.register(&doc, &folder)?;
        let open = OpenWorkspace {
            folder,
            document: doc,
            baseline,
            good,
            recovered,
            _lock: lock,
        };
        let loaded = Self::loaded(&open);
        self.open.insert(loaded.document.id.clone(), open);
        Ok(loaded)
    }
    fn loaded(open: &OpenWorkspace) -> Loaded {
        Loaded {
            document: open.document.clone(),
            folder: display(&open.folder),
            recovered: open.recovered,
        }
    }
    pub fn save(&mut self, id: &str, mut layout: Layout) -> Result<Loaded, String> {
        for node in &mut layout.nodes {
            if node.kind == "terminal" && node.cwd.as_deref().is_none_or(|s| s.trim().is_empty()) {
                node.cwd = Some(display(&self.home));
            }
        }
        layout.validate()?;
        let open = self.open.get_mut(id).ok_or("Workspace is not open")?;
        if read(&open.folder.join(LAYOUT))? != open.baseline {
            return Err("Workspace changed on disk. Autosave stopped to protect those changes. Close without saving and reopen to load the disk version.".into());
        }
        let doc = Document {
            version: 1,
            id: open.document.id.clone(),
            name: open.document.name.clone(),
            revision: open
                .document
                .revision
                .checked_add(1)
                .ok_or("Workspace revision overflow")?,
            nodes: layout.nodes,
            viewport: layout.viewport,
            settings: layout.settings,
            edges: layout.edges,
        };
        let bytes = encode(&doc)?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err("Workspace layout exceeds 4 MiB".into());
        }
        if open.recovered {
            if let Some(original) = &open.baseline {
                use std::io::Write;
                let stamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(|e| e.to_string())?
                    .as_nanos();
                let archive = open.folder.join(format!(
                    "workspace.corrupt-{}-{stamp}.json",
                    std::process::id()
                ));
                let mut file = std::fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(archive)
                    .map_err(|e| e.to_string())?;
                file.write_all(original)
                    .and_then(|_| file.sync_all())
                    .map_err(|e| e.to_string())?;
            }
        }
        atomic_file::write(&open.folder.join(BACKUP), &open.good)?;
        atomic_file::write(&open.folder.join(LAYOUT), &bytes)?;
        open.document = doc;
        open.baseline = Some(bytes.clone());
        open.good = bytes;
        open.recovered = false;
        Ok(Self::loaded(open))
    }
    pub fn release(&mut self, id: &str) {
        self.open.remove(id);
    }
    pub fn activate(&self, id: &str) -> Result<(), String> {
        if !self.open.contains_key(id) {
            return Err("Open the workspace before activating it".into());
        }
        self.update_catalog(|catalog| {
            catalog.last_active = Some(id.to_owned());
            Ok(())
        })
    }
}
