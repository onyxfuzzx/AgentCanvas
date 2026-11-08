use crate::workspace::*;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
const ID: &str = "00000000-0000-4000-8000-000000000100";
struct Fixture {
    root: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let root = std::env::current_dir()
            .unwrap()
            .join("target")
            .join(format!(
                "workspace-test-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
        fs::create_dir_all(&root).unwrap();
        Self { root }
    }
    fn store(&self) -> WorkspaceStore {
        WorkspaceStore::new(self.root.join("data"), self.root.clone())
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let target = std::env::current_dir().unwrap().join("target");
        if self.root.parent() == Some(target.as_path())
            && self
                .root
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("workspace-test-")
        {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
}
fn layout() -> Layout {
    Layout {
        nodes: vec![Node {
            id: "00000000-0000-4000-8000-000000000001".into(),
            kind: "terminal".into(),
            title: "API agent".into(),
            color: "#708f7c".into(),
            x: -240.0,
            y: 81.0,
            width: 660.0,
            height: 430.0,
            z: 2,
            shell: Some("cmd".into()),
            cwd: Some("Z:\\missing-directory".into()),
        }],
        viewport: Viewport {
            x: 37.0,
            y: -200.0,
            zoom: 0.75,
        },
        settings: Settings { snap_grid: true },
        edges: Vec::new(),
    }
}
#[test]
fn workspace_roundtrip_and_last_active_survive_store_restart() {
    let fixture = Fixture::new();
    let mut store = fixture.store();
    let created = store
        .create(ID.into(), "Backend project".into(), None)
        .unwrap();
    assert!(PathBuf::from(&created.folder).join("notes").is_dir());
    let saved = store.save(ID, layout()).unwrap();
    assert_eq!(saved.document.revision, 1);
    store.activate(ID).unwrap();
    drop(store);
    let mut restored = fixture.store();
    assert_eq!(restored.list().unwrap().last_active.as_deref(), Some(ID));
    let loaded = restored.open(ID).unwrap();
    assert_eq!(
        loaded.document.nodes[0].cwd.as_deref(),
        Some("Z:\\missing-directory")
    );
    assert_eq!(loaded.document.nodes[0].x, -240.0);
    assert!(loaded.document.settings.snap_grid);
    assert_eq!(loaded.document.viewport.zoom, 0.75);
    let json = fs::read_to_string(PathBuf::from(loaded.folder).join("workspace.json")).unwrap();
    assert!(!json.contains("scrollback"));
    assert!(!json.contains("status"));
}
#[test]
fn external_edits_are_not_overwritten() {
    let fixture = Fixture::new();
    let mut store = fixture.store();
    let loaded = store
        .create(ID.into(), "External edit".into(), None)
        .unwrap();
    let path = PathBuf::from(loaded.folder).join("workspace.json");
    let bytes = b"external editor changed this";
    fs::write(&path, bytes).unwrap();
    assert!(store
        .save(ID, layout())
        .unwrap_err()
        .contains("changed on disk"));
    assert_eq!(fs::read(path).unwrap(), bytes);
}
#[test]
fn truncated_primary_recovers_backup_and_archives_original_on_save() {
    let fixture = Fixture::new();
    let mut store = fixture.store();
    let created = store.create(ID.into(), "Recovery".into(), None).unwrap();
    store.save(ID, layout()).unwrap();
    store.release(ID);
    let folder = PathBuf::from(created.folder);
    fs::write(folder.join("workspace.json"), b"{truncated").unwrap();
    let recovered = store.open(ID).unwrap();
    assert!(recovered.recovered);
    assert_eq!(recovered.document.revision, 0);
    assert_eq!(
        fs::read(folder.join("workspace.json")).unwrap(),
        b"{truncated"
    );
    store.save(ID, layout()).unwrap();
    let archive = fs::read_dir(&folder)
        .unwrap()
        .flatten()
        .find(|e| {
            e.file_name()
                .to_string_lossy()
                .starts_with("workspace.corrupt-")
        })
        .unwrap();
    assert_eq!(fs::read(archive.path()).unwrap(), b"{truncated");
    let saved: Document =
        serde_json::from_slice(&fs::read(folder.join("workspace.json")).unwrap()).unwrap();
    assert_eq!(saved.revision, 1);
}
#[test]
fn unsupported_versions_and_fields_never_fall_back_or_change_files() {
    let fixture = Fixture::new();
    let mut store = fixture.store();
    let created = store.create(ID.into(), "Future".into(), None).unwrap();
    store.release(ID);
    let path = PathBuf::from(created.folder).join("workspace.json");
    let original = fs::read(&path).unwrap();
    let mut value: serde_json::Value = serde_json::from_slice(&original).unwrap();
    value["version"] = 99.into();
    let future = serde_json::to_vec(&value).unwrap();
    fs::write(&path, &future).unwrap();
    assert!(store.open(ID).is_err());
    assert_eq!(fs::read(&path).unwrap(), future);
    value["version"] = 1.into();
    value["futureData"] = true.into();
    let extra = serde_json::to_vec(&value).unwrap();
    fs::write(&path, &extra).unwrap();
    assert!(store.open(ID).is_err());
    assert_eq!(fs::read(path).unwrap(), extra);
}
#[test]
fn save_rejects_duplicate_nodes_and_arbitrary_shells_without_touching_disk() {
    let fixture = Fixture::new();
    let mut store = fixture.store();
    let created = store.create(ID.into(), "Validation".into(), None).unwrap();
    let path = PathBuf::from(created.folder).join("workspace.json");
    let original = fs::read(&path).unwrap();
    let mut invalid = layout();
    invalid.nodes.push(invalid.nodes[0].clone());
    assert!(store.save(ID, invalid).is_err());
    let mut invalid = layout();
    invalid.nodes[0].shell = Some("powershell -command injected".into());
    assert!(store.save(ID, invalid).is_err());
    let mut invalid = layout();
    invalid.viewport.zoom = 0.0;
    assert!(store.save(ID, invalid).is_err());
    assert_eq!(fs::read(path).unwrap(), original);
}
#[cfg(windows)]
#[test]
fn second_instance_cannot_open_locked_workspace_and_lock_releases() {
    let fixture = Fixture::new();
    let mut first = fixture.store();
    first.create(ID.into(), "Exclusive".into(), None).unwrap();
    let mut second = fixture.store();
    assert!(second.open(ID).is_err());
    first.release(ID);
    assert!(second.open(ID).is_ok());
}
#[test]
fn explicit_folder_registration_and_create_never_overwrite_existing_workspace() {
    let fixture = Fixture::new();
    let mut first = fixture.store();
    let folder = fixture.root.join("chosen-folder");
    first
        .create(
            ID.into(),
            "Chosen folder".into(),
            Some(folder.to_string_lossy().into_owned()),
        )
        .unwrap();
    first.release(ID);
    assert!(first
        .create(
            ID.into(),
            "Overwrite".into(),
            Some(folder.to_string_lossy().into_owned())
        )
        .is_err());
    let mut another_catalog =
        WorkspaceStore::new(fixture.root.join("other-data"), fixture.root.clone());
    let loaded = another_catalog
        .open_folder(folder.to_string_lossy().into_owned())
        .unwrap();
    assert_eq!(loaded.document.name, "Chosen folder");
    assert_eq!(another_catalog.list().unwrap().entries.len(), 1);
}
