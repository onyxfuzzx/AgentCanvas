//! Windows-only, local, current-user named pipes. No network transport fallback.
use crate::collaboration::{Collaboration, Reply, Request, MAX_FRAME};
use std::sync::Arc;

#[cfg(windows)]
mod windows {
    use super::*;
    use std::{
        ffi::c_void,
        mem::{size_of, zeroed},
        ptr::{null, null_mut},
        sync::atomic::{AtomicBool, Ordering},
        thread::{self, JoinHandle},
        time::{Duration, Instant},
    };
    use windows_sys::Win32::{
        Foundation::*,
        Security::{Authorization::*, Cryptography::*, *},
        Storage::FileSystem::*,
        System::{Pipes::*, Threading::*, IO::*},
    };
    fn err() -> String {
        std::io::Error::last_os_error().to_string()
    }
    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(Some(0)).collect()
    }
    struct Handle(HANDLE);
    // A handle is moved to exactly one pipe worker and never used concurrently.
    unsafe impl Send for Handle {}
    impl Drop for Handle {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
    pub fn random_secret() -> Result<String, String> {
        let mut bytes = [0u8; 32];
        if unsafe {
            BCryptGenRandom(
                null_mut(),
                bytes.as_mut_ptr(),
                32,
                BCRYPT_USE_SYSTEM_PREFERRED_RNG,
            )
        } < 0
        {
            return Err("Windows secure random source unavailable".into());
        }
        Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
    }
    struct Descriptor(*mut c_void);
    impl Drop for Descriptor {
        fn drop(&mut self) {
            unsafe {
                LocalFree(self.0);
            }
        }
    }
    fn descriptor() -> Result<Descriptor, String> {
        unsafe {
            let mut token = null_mut();
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
                return Err(err());
            }
            let token = Handle(token);
            let mut bytes = 0;
            GetTokenInformation(token.0, TokenUser, null_mut(), 0, &mut bytes);
            let mut buffer = vec![0usize; (bytes as usize).div_ceil(size_of::<usize>())];
            if GetTokenInformation(
                token.0,
                TokenUser,
                buffer.as_mut_ptr().cast(),
                bytes,
                &mut bytes,
            ) == 0
            {
                return Err(err());
            }
            let user = &*(buffer.as_ptr().cast::<TOKEN_USER>());
            let mut sid = null_mut();
            if ConvertSidToStringSidW(user.User.Sid, &mut sid) == 0 {
                return Err(err());
            }
            let allocation = Descriptor(sid.cast());
            let mut length = 0;
            while *sid.add(length) != 0 {
                length += 1;
            }
            let sid = String::from_utf16(std::slice::from_raw_parts(sid, length))
                .map_err(|e| e.to_string())?;
            drop(allocation);
            let sddl = wide(&format!("D:P(A;;GA;;;{sid})"));
            let mut sd = null_mut();
            if ConvertStringSecurityDescriptorToSecurityDescriptorW(
                sddl.as_ptr(),
                1,
                &mut sd,
                null_mut(),
            ) == 0
            {
                return Err(err());
            }
            Ok(Descriptor(sd))
        }
    }
    fn pipe(name: &str, first: bool) -> Result<Handle, String> {
        let descriptor = descriptor()?;
        let attributes = SECURITY_ATTRIBUTES {
            nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: descriptor.0,
            bInheritHandle: 0,
        };
        let handle = unsafe {
            CreateNamedPipeW(
                wide(name).as_ptr(),
                PIPE_ACCESS_DUPLEX
                    | FILE_FLAG_OVERLAPPED
                    | if first {
                        FILE_FLAG_FIRST_PIPE_INSTANCE
                    } else {
                        0
                    },
                PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
                4,
                MAX_FRAME as u32,
                MAX_FRAME as u32,
                1000,
                &attributes,
            )
        };
        if handle == INVALID_HANDLE_VALUE {
            Err(err())
        } else {
            Ok(Handle(handle))
        }
    }
    fn operation(
        handle: &Handle,
        stop: &AtomicBool,
        deadline: Option<Instant>,
        start: impl FnOnce(*mut OVERLAPPED) -> BOOL,
        connected: bool,
    ) -> Result<u32, String> {
        let event = Handle(unsafe { CreateEventW(null(), 1, 0, null()) });
        if event.0.is_null() {
            return Err(err());
        }
        let mut overlapped: OVERLAPPED = unsafe { zeroed() };
        overlapped.hEvent = event.0;
        let started = start(&mut overlapped);
        let error = unsafe { GetLastError() };
        if started == 0 && connected && error == ERROR_PIPE_CONNECTED {
            return Ok(0);
        }
        if started == 0 && error != ERROR_IO_PENDING {
            return Err(err());
        }
        if started == 0 {
            loop {
                let wait = unsafe { WaitForSingleObject(event.0, 100) };
                if wait == WAIT_OBJECT_0 {
                    break;
                }
                if wait != WAIT_TIMEOUT
                    || stop.load(Ordering::SeqCst)
                    || deadline.is_some_and(|d| Instant::now() >= d)
                {
                    // Wait for cancellation completion before freeing OVERLAPPED or buffers.
                    unsafe {
                        CancelIoEx(handle.0, &overlapped);
                        let mut ignored = 0;
                        GetOverlappedResult(handle.0, &overlapped, &mut ignored, 1);
                    }
                    return Err("Named-pipe operation cancelled or timed out".into());
                }
            }
        }
        let mut count = 0;
        if unsafe { GetOverlappedResult(handle.0, &overlapped, &mut count, 0) } == 0 {
            Err(err())
        } else {
            Ok(count)
        }
    }
    fn read_exact(
        handle: &Handle,
        buffer: &mut [u8],
        stop: &AtomicBool,
        deadline: Instant,
    ) -> Result<(), String> {
        let mut offset = 0;
        while offset < buffer.len() {
            let tail = &mut buffer[offset..];
            let count = operation(
                handle,
                stop,
                Some(deadline),
                |ov| unsafe {
                    ReadFile(
                        handle.0,
                        tail.as_mut_ptr(),
                        tail.len() as u32,
                        null_mut(),
                        ov,
                    )
                },
                false,
            )? as usize;
            if count == 0 {
                return Err("Named-pipe peer disconnected".into());
            }
            offset += count;
        }
        Ok(())
    }
    fn write_all(
        handle: &Handle,
        buffer: &[u8],
        stop: &AtomicBool,
        deadline: Instant,
    ) -> Result<(), String> {
        let mut offset = 0;
        while offset < buffer.len() {
            let tail = &buffer[offset..];
            let count = operation(
                handle,
                stop,
                Some(deadline),
                |ov| unsafe {
                    WriteFile(handle.0, tail.as_ptr(), tail.len() as u32, null_mut(), ov)
                },
                false,
            )? as usize;
            if count == 0 {
                return Err("Named-pipe peer disconnected".into());
            }
            offset += count;
        }
        Ok(())
    }
    fn receive(handle: &Handle, stop: &AtomicBool) -> Result<Vec<u8>, String> {
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut prefix = [0; 4];
        read_exact(handle, &mut prefix, stop, deadline)?;
        let length = u32::from_le_bytes(prefix) as usize;
        if length == 0 || length > MAX_FRAME {
            return Err("Invalid frame length".into());
        }
        let mut data = vec![0; length];
        read_exact(handle, &mut data, stop, deadline)?;
        Ok(data)
    }
    fn send(handle: &Handle, data: &[u8], stop: &AtomicBool) -> Result<(), String> {
        if data.is_empty() || data.len() > MAX_FRAME {
            return Err("Response exceeds 64 KiB".into());
        }
        let deadline = Instant::now() + Duration::from_secs(5);
        write_all(handle, &(data.len() as u32).to_le_bytes(), stop, deadline)?;
        write_all(handle, data, stop, deadline)
    }
    pub struct Server {
        stop: Arc<AtomicBool>,
        workers: Vec<JoinHandle<()>>,
    }
    impl Server {
        pub fn start(service: Arc<Collaboration>) -> Result<Self, String> {
            let handles = (0..4)
                .map(|i| pipe(&service.pipe, i == 0))
                .collect::<Result<Vec<_>, _>>()?;
            let mut server = Self {
                stop: Arc::new(AtomicBool::new(false)),
                workers: Vec::new(),
            };
            for handle in handles {
                let service = service.clone();
                let stop = server.stop.clone();
                let worker = thread::Builder::new()
                    .name("agent-peer-pipe".into())
                    .spawn(move || {
                        while !stop.load(Ordering::SeqCst) {
                            if operation(
                                &handle,
                                &stop,
                                None,
                                |ov| unsafe { ConnectNamedPipe(handle.0, ov) },
                                true,
                            )
                            .is_err()
                            {
                                if stop.load(Ordering::SeqCst) {
                                    break;
                                }
                                unsafe {
                                    DisconnectNamedPipe(handle.0);
                                }
                                continue;
                            }
                            let _ = (|| -> Result<(), String> {
                                let data = receive(&handle, &stop)?;
                                let reply = match serde_json::from_slice::<Request>(&data) {
                                    Ok(request) => service.handle(request),
                                    Err(_) => Reply {
                                        request_id: String::new(),
                                        ok: false,
                                        result: serde_json::Value::Null,
                                        error: Some("PROTOCOL: invalid request".into()),
                                    },
                                };
                                let mut bytes =
                                    serde_json::to_vec(&reply).map_err(|e| e.to_string())?;
                                if bytes.len() > MAX_FRAME {
                                    bytes = serde_json::to_vec(&Reply {
                                        request_id: reply.request_id,
                                        ok: false,
                                        result: serde_json::Value::Null,
                                        error: Some("RESPONSE_TOO_LARGE".into()),
                                    })
                                    .map_err(|e| e.to_string())?;
                                }
                                send(&handle, &bytes, &stop)?;
                                // ACK proves the client drained the reply; FlushFileBuffers
                                // would let an unresponsive client block shutdown forever.
                                let mut ack = [0];
                                read_exact(
                                    &handle,
                                    &mut ack,
                                    &stop,
                                    Instant::now() + Duration::from_secs(5),
                                )?;
                                Ok(())
                            })();
                            unsafe {
                                DisconnectNamedPipe(handle.0);
                            }
                        }
                    })
                    .map_err(|e| e.to_string())?;
                server.workers.push(worker);
            }
            Ok(server)
        }
    }
    impl Drop for Server {
        fn drop(&mut self) {
            self.stop.store(true, Ordering::SeqCst);
            for worker in self.workers.drain(..) {
                let _ = worker.join();
            }
        }
    }
    pub fn request(name: &str, request: &Request) -> Result<Reply, String> {
        if !name.starts_with(r"\\.\pipe\agentcanvas-") || name.len() > 256 {
            return Err("Invalid local pipe name".into());
        }
        let deadline = Instant::now() + Duration::from_secs(3);
        let handle = loop {
            let handle = unsafe {
                CreateFileW(
                    wide(name).as_ptr(),
                    GENERIC_READ | GENERIC_WRITE,
                    0,
                    null(),
                    OPEN_EXISTING,
                    FILE_FLAG_OVERLAPPED | SECURITY_SQOS_PRESENT | SECURITY_ANONYMOUS,
                    null_mut(),
                )
            };
            if handle != INVALID_HANDLE_VALUE {
                break Handle(handle);
            }
            if unsafe { GetLastError() } != ERROR_PIPE_BUSY || Instant::now() >= deadline {
                return Err(err());
            }
            unsafe {
                WaitNamedPipeW(wide(name).as_ptr(), 100);
            }
        };
        let stop = AtomicBool::new(false);
        let bytes = serde_json::to_vec(request).map_err(|e| e.to_string())?;
        send(&handle, &bytes, &stop)?;
        let bytes = receive(&handle, &stop)?;
        write_all(
            &handle,
            &[6],
            &stop,
            Instant::now() + Duration::from_secs(1),
        )?;
        let reply: Reply = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        if reply.request_id != request.request_id {
            return Err("Mismatched response ID".into());
        }
        Ok(reply)
    }
}
#[cfg(windows)]
pub use windows::{random_secret, request, Server};
#[cfg(not(windows))]
pub fn random_secret() -> Result<String, String> {
    Err("Windows named pipes are required".into())
}
#[cfg(not(windows))]
pub struct Server;
#[cfg(not(windows))]
impl Server {
    pub fn start(_: Arc<Collaboration>) -> Result<Self, String> {
        Err("Windows named pipes are required".into())
    }
}
#[cfg(not(windows))]
pub fn request(_: &str, _: &Request) -> Result<Reply, String> {
    Err("Windows named pipes are required".into())
}
