use crate::{
    atomic_file,
    workspace::{id_valid, WorkspaceStore},
};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

const LIMIT: usize = 512 * 1024;
pub fn valid_path(path: &str) -> bool {
    path.strip_prefix("notes/")
        .and_then(|p| p.strip_suffix(".md"))
        .is_some_and(id_valid)
}
fn plain(path: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Err("Note paths cannot contain reparse points".into());
        }
    }
    if meta.file_type().is_symlink() {
        return Err("Note paths cannot contain symlinks".into());
    }
    Ok(())
}
fn path(
    store: &WorkspaceStore,
    workspace: &str,
    relative: &str,
    create: bool,
) -> Result<PathBuf, String> {
    if !valid_path(relative) {
        return Err("Use notes/<UUID>.md inside the workspace".into());
    }
    let folder = store.folder(workspace)?;
    let notes = folder.join("notes");
    if create && !notes.exists() {
        fs::create_dir(&notes).map_err(|e| e.to_string())?;
    }
    plain(&notes)?;
    if !fs::canonicalize(&notes)
        .map_err(|e| e.to_string())?
        .starts_with(folder)
    {
        return Err("Note folder is outside the workspace".into());
    }
    let target = notes.join(relative.strip_prefix("notes/").unwrap());
    // Never follow dangling links, junctions or replacement files outside notes/.
    if fs::symlink_metadata(&target).is_ok() {
        plain(&target)?;
    }
    Ok(target)
}
fn read_file(path: &Path) -> Result<String, String> {
    let file = fs::File::open(path).map_err(|e| format!("Note could not read: {e}"))?;
    let mut bytes = Vec::new();
    file.take(LIMIT as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > LIMIT {
        return Err("Note exceeds 512 KiB".into());
    }
    String::from_utf8(bytes).map_err(|_| "Note must be UTF-8 text".into())
}
fn validate(text: &str) -> Result<(), String> {
    if text.len() > LIMIT || text.contains('\0') {
        Err("Note must be UTF-8 text without NUL, at most 512 KiB".into())
    } else {
        Ok(())
    }
}
pub fn create(store: &WorkspaceStore, workspace: &str, id: &str) -> Result<String, String> {
    if !id_valid(id) {
        return Err("Invalid note ID".into());
    }
    let relative = format!("notes/{id}.md");
    let path = path(store, workspace, &relative, true)?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.write_all(b"# New note\n\nWrite your thoughts here.\n")
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    Ok(relative)
}
pub fn read(store: &WorkspaceStore, workspace: &str, relative: &str) -> Result<String, String> {
    read_file(&path(store, workspace, relative, false)?)
}
pub fn save(
    store: &WorkspaceStore,
    workspace: &str,
    relative: &str,
    expected: &str,
    content: &str,
) -> Result<(), String> {
    validate(expected)?;
    validate(content)?;
    let path = path(store, workspace, relative, false)?;
    let actual = read_file(&path)?;
    if actual != expected {
        return Err("Note changed on disk. Your draft is kept here. Copy it if needed, then Reload disk to load the external version.".into());
    }
    let backup = path.with_extension("md.bak");
    if fs::symlink_metadata(&backup).is_ok() {
        plain(&backup)?;
    }
    atomic_file::write(&backup, actual.as_bytes())?;
    atomic_file::write(&path, content.as_bytes())
}
