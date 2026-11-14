use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};

static SEQUENCE: AtomicU64 = AtomicU64::new(0);

/// A same-directory write, flushed before atomic replacement. The old file is
/// never truncated. Temporary files belong solely to this invocation.
pub fn write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("Missing parent folder")?;
    let temporary = parent.join(format!(
        ".save-{}-{}.tmp",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ));
    let mut created = false;
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
        created = true;
        file.write_all(bytes)
            .and_then(|_| file.sync_all())
            .map_err(|e| e.to_string())?;
        drop(file);
        replace(&temporary, path)
    })();
    if created && result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[cfg(windows)]
fn replace(from: &Path, to: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let from: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let to: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    for attempt in 0..6 {
        if unsafe {
            MoveFileExW(
                from.as_ptr(),
                to.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        } != 0
        {
            return Ok(());
        }
        let error = std::io::Error::last_os_error();
        // Windows scanners may briefly hold a non-delete-sharing handle after close.
        // Retry only transient access/sharing failures; keep the original and flushed
        // temporary file intact. A persistent lock still fails within 620 ms.
        if attempt == 5 || !matches!(error.raw_os_error(), Some(5 | 32 | 33)) {
            return Err(error.to_string());
        }
        std::thread::sleep(std::time::Duration::from_millis(20u64 << attempt));
    }
    unreachable!()
}

#[cfg(not(windows))]
fn replace(from: &Path, to: &Path) -> Result<(), String> {
    fs::rename(from, to).map_err(|e| e.to_string())?;
    if let Some(parent) = to.parent() {
        File::open(parent)
            .and_then(|f| f.sync_all())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub struct Lock {
    _file: File,
}
impl Lock {
    pub fn acquire(path: &Path) -> Result<Self, String> {
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            options.share_mode(0);
        }
        options
            .open(path)
            .map(|file| Self { _file: file })
            .map_err(|e| format!("Folder is already open in another app, or is not writable: {e}"))
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    #[test]
    fn atomic_replacement_tolerates_a_short_lived_windows_reader_without_losing_the_old_file() {
        use std::os::windows::fs::OpenOptionsExt;
        let root = std::env::current_dir()
            .unwrap()
            .join("target")
            .join(format!(
                "atomic-retry-test-{}",
                crate::ipc::random_secret().unwrap()
            ));
        fs::create_dir_all(&root).unwrap();
        let path = root.join("metadata.json");
        fs::write(&path, b"old").unwrap();
        let file = OpenOptions::new()
            .read(true)
            .share_mode(1)
            .open(&path)
            .unwrap();
        let release = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(70));
            drop(file);
        });
        write(&path, b"new").unwrap();
        release.join().unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new");
        assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
        let expected = std::env::current_dir().unwrap().join("target");
        if root.parent() == Some(expected.as_path())
            && root
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("atomic-retry-test-")
        {
            fs::remove_dir_all(root).unwrap();
        }
    }
}
