//! A job exists BEFORE the trusted PTY host launches a user shell.
//! The host joins the job first; every shell descendant inherits membership.
//! Backend death closes the sole remaining handle and kills the entire job.
#[cfg(windows)]
mod platform {
    use std::{
        io, mem, ptr,
        sync::atomic::{AtomicU64, Ordering},
    };
    use windows_sys::Win32::{
        Foundation::{CloseHandle, HANDLE},
        System::{
            JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JobObjectBasicAccountingInformation,
                JobObjectExtendedLimitInformation, OpenJobObjectW, QueryInformationJobObject,
                SetInformationJobObject, TerminateJobObject,
                JOBOBJECT_BASIC_ACCOUNTING_INFORMATION, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            },
            SystemServices::JOB_OBJECT_ASSIGN_PROCESS,
            Threading::GetCurrentProcess,
        },
    };

    pub struct Job {
        handle: usize,
        pub name: String,
    }

    static JOB_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(Some(0)).collect()
    }

    impl Job {
        pub fn new(id: &str) -> Result<Self, String> {
            let sequence = JOB_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let name = format!("Local\\agentcanvas-{}-{id}-{sequence}", std::process::id());
            let handle = unsafe { CreateJobObjectW(ptr::null(), wide(&name).as_ptr()) };
            if handle.is_null() {
                return Err(io::Error::last_os_error().to_string());
            }
            let job = Self {
                handle: handle as usize,
                name,
            };
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { mem::zeroed() };
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = unsafe {
                SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    &limits as *const _ as *const _,
                    mem::size_of_val(&limits) as u32,
                )
            };
            if ok == 0 {
                return Err(io::Error::last_os_error().to_string());
            }
            Ok(job)
        }

        pub fn terminate(&self) {
            unsafe {
                TerminateJobObject(self.handle as HANDLE, 1);
            }
        }

        pub fn wait_empty(&self, timeout: std::time::Duration) -> Result<(), String> {
            wait_empty(self.handle as HANDLE, timeout)
        }

        /// Own a bounded native helper and its descendants until this operation ends.
        pub fn attach_child(&self, child: &std::process::Child) -> Result<(), String> {
            use std::os::windows::io::AsRawHandle;
            if unsafe {
                AssignProcessToJobObject(self.handle as HANDLE, child.as_raw_handle() as HANDLE)
            } == 0
            {
                return Err(io::Error::last_os_error().to_string());
            }
            Ok(())
        }
    }

    fn wait_empty(handle: HANDLE, timeout: std::time::Duration) -> Result<(), String> {
        let deadline = std::time::Instant::now() + timeout;
        loop {
            let mut info: JOBOBJECT_BASIC_ACCOUNTING_INFORMATION = unsafe { mem::zeroed() };
            if unsafe {
                QueryInformationJobObject(
                    handle,
                    JobObjectBasicAccountingInformation,
                    &mut info as *mut _ as *mut _,
                    mem::size_of_val(&info) as u32,
                    ptr::null_mut(),
                )
            } == 0
            {
                return Err(io::Error::last_os_error().to_string());
            }
            if info.ActiveProcesses == 0 {
                return Ok(());
            }
            if std::time::Instant::now() >= deadline {
                return Err("Old editor processes are still stopping; replacement refused".into());
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
    }

    pub fn wait_editor(pid: u32, session: &str) -> Result<(), String> {
        let name = format!("Local\\agentcanvas-{pid}-editor-{session}-0");
        let handle = unsafe { OpenJobObjectW(4, 0, wide(&name).as_ptr()) };
        if handle.is_null() {
            let error = io::Error::last_os_error();
            return if error.raw_os_error() == Some(2) {
                Ok(())
            } else {
                Err(error.to_string())
            };
        }
        let result = wait_empty(handle, std::time::Duration::from_secs(5));
        unsafe {
            CloseHandle(handle);
        }
        result
    }

    impl Drop for Job {
        fn drop(&mut self) {
            self.terminate();
            unsafe {
                CloseHandle(self.handle as HANDLE);
            }
        }
    }

    pub fn join(name: &str) -> Result<(), String> {
        let handle = unsafe { OpenJobObjectW(JOB_OBJECT_ASSIGN_PROCESS, 0, wide(name).as_ptr()) };
        if handle.is_null() {
            return Err(io::Error::last_os_error().to_string());
        }
        let ok = unsafe { AssignProcessToJobObject(handle, GetCurrentProcess()) };
        let error = io::Error::last_os_error();
        unsafe {
            CloseHandle(handle);
        }
        if ok == 0 {
            Err(error.to_string())
        } else {
            Ok(())
        }
    }
}

#[cfg(not(windows))]
mod platform {
    pub struct Job {
        pub name: String,
    }

    impl Job {
        pub fn new(_: &str) -> Result<Self, String> {
            Err("Windows ConPTY is required".into())
        }

        pub fn terminate(&self) {}
    }

    pub fn join(_: &str) -> Result<(), String> {
        Err("Windows is required".into())
    }
}

#[cfg(windows)]
pub use platform::wait_editor;
pub use platform::{join, Job};
