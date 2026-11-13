//! Untrusted, explicitly opened browser surfaces. No browser command accepts script text.
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tauri::webview::{NewWindowResponse, PermissionResponse, WebviewBuilder};
use tauri::{LogicalPosition, LogicalSize, Manager, Webview, WebviewUrl};

pub(crate) fn valid_url(value: &str) -> bool {
    if value.len() > 4096 || value.bytes().any(|c| c <= 32 || c == 127 || c == b'\\') {
        return false;
    }
    let Ok(url) = tauri::Url::parse(value) else {
        return false;
    };
    matches!(url.scheme(), "http" | "https")
        && url
            .host_str()
            .is_some_and(|host| !host.ends_with(".localhost"))
        && url.username().is_empty()
        && url.password().is_none()
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Surface {
    id: String,
    bounds: Rect,
    clips: Vec<Rect>,
    zoom: f64,
}
impl Surface {
    fn validate(&self) -> Result<(), String> {
        let b = &self.bounds;
        if !crate::workspace::id_valid(&self.id)
            || ![b.x, b.y, b.width, b.height, self.zoom]
                .iter()
                .all(|v| v.is_finite())
            || b.x.abs() > 40000.0
            || b.y.abs() > 40000.0
            || !(1.0..=20000.0).contains(&b.width)
            || !(1.0..=20000.0).contains(&b.height)
            || !(0.25..=2.0).contains(&self.zoom)
            || self.clips.len() > 256
            || self.clips.iter().any(|r| {
                ![r.x, r.y, r.width, r.height].iter().all(|v| v.is_finite())
                    || r.x < 0.0
                    || r.y < 0.0
                    || r.width <= 0.0
                    || r.height <= 0.0
                    || r.x + r.width > b.width + 0.01
                    || r.y + r.height > b.height + 0.01
            })
        {
            return Err("Invalid browser surface geometry".into());
        }
        Ok(())
    }
}
#[derive(Clone, Default, Serialize)]
pub struct Status {
    id: String,
    url: String,
    title: String,
    loading: bool,
}
struct Session {
    view: Webview,
    status: Arc<Mutex<Status>>,
    applied: Option<(Surface, f64)>,
}
#[derive(Default)]
pub struct Browsers(Mutex<HashMap<String, Session>>);

async fn with_browsers<T: Send + 'static>(
    state: tauri::State<'_, Arc<Browsers>>,
    action: impl FnOnce(&mut HashMap<String, Session>) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut sessions = state.0.lock().map_err(|_| "Browser state unavailable")?;
        action(&mut sessions)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(windows)]
fn platform(
    view: &Webview,
    action: impl FnOnce(tauri::webview::PlatformWebview) -> Result<(), String> + Send + 'static,
) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel();
    view.with_webview(move |platform| {
        let _ = tx.send(action(platform));
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|e| e.to_string())?
}

#[cfg(windows)]
fn secure(view: &Webview) -> Result<(), String> {
    platform(view, |platform| unsafe {
        let settings = platform
            .controller()
            .CoreWebView2()
            .and_then(|v| v.Settings())
            .map_err(|e| e.to_string())?;
        // Tauri uses WebMessageReceived for IPC on Windows. Disable it before loading any page.
        settings
            .SetIsWebMessageEnabled(false)
            .map_err(|e| e.to_string())?;
        settings
            .SetAreDevToolsEnabled(false)
            .map_err(|e| e.to_string())?;
        settings
            .SetAreDefaultContextMenusEnabled(false)
            .map_err(|e| e.to_string())?;
        settings
            .SetIsZoomControlEnabled(false)
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}
#[cfg(not(windows))]
fn secure(_: &Webview) -> Result<(), String> {
    Err("Browser nodes require Windows WebView2".into())
}

#[cfg(windows)]
fn clip(view: &Webview, surface: &Surface) -> Result<(), String> {
    let factor = view.window().scale_factor().map_err(|e| e.to_string())?;
    let regions = surface.clips.clone();
    let origin = (surface.bounds.x, surface.bounds.y);
    platform(view, move |platform| {
        use windows::Win32::{
            Foundation::HWND,
            Graphics::Gdi::{CombineRgn, CreateRectRgn, DeleteObject, SetWindowRgn, RGN_OR},
        };
        unsafe {
            let mut hwnd = HWND::default();
            platform
                .controller()
                .ParentWindow(&mut hwnd)
                .map_err(|e| e.to_string())?;
            let region = CreateRectRgn(0, 0, 0, 0);
            if region.is_invalid() {
                return Err("Cannot allocate browser clip region".into());
            }
            for r in regions {
                // Round inward so no native pixel can cover a header/overlay outside its clip.
                let Some([left, top, right, bottom]) = physical_clip(origin, &r, factor) else {
                    continue;
                };
                let part = CreateRectRgn(left, top, right, bottom);
                if part.is_invalid() {
                    let _ = DeleteObject(region.into());
                    return Err("Cannot allocate browser clip region".into());
                }
                let result = CombineRgn(Some(region), Some(region), Some(part), RGN_OR);
                let _ = DeleteObject(part.into());
                if result.0 == 0 {
                    let _ = DeleteObject(region.into());
                    return Err("Cannot combine browser clip region".into());
                }
            }
            if SetWindowRgn(hwnd, Some(region), true) == 0 {
                let _ = DeleteObject(region.into());
                return Err("Cannot apply browser clip region".into());
            }
            // Windows owns region after successful SetWindowRgn.
            Ok(())
        }
    })
}

#[cfg(any(windows, test))]
fn physical_clip(origin: (f64, f64), r: &Rect, dpi: f64) -> Option<[i32; 4]> {
    let left = (((origin.0 + r.x) * dpi).ceil() - (origin.0 * dpi).round()) as i32;
    let top = (((origin.1 + r.y) * dpi).ceil() - (origin.1 * dpi).round()) as i32;
    let right = (((origin.0 + r.x + r.width) * dpi).floor() - (origin.0 * dpi).round()) as i32;
    let bottom = (((origin.1 + r.y + r.height) * dpi).floor() - (origin.1 * dpi).round()) as i32;
    (right > left && bottom > top).then_some([left, top, right, bottom])
}
#[cfg(not(windows))]
fn clip(_: &Webview, _: &Surface) -> Result<(), String> {
    Err("Browser nodes require Windows WebView2".into())
}

#[tauri::command]
pub async fn browser_open(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Browsers>>,
    id: String,
    url: String,
) -> Result<(), String> {
    if !crate::workspace::id_valid(&id) || !valid_url(&url) {
        return Err("Use a valid node ID and an HTTP(S) URL without credentials".into());
    }
    with_browsers(state, move |sessions| {
        if let Some(session) = sessions.get(&id) {
            return session
                .view
                .navigate(url.parse().map_err(|_| "Invalid URL")?)
                .map_err(|e| e.to_string());
        }
        if sessions.len() >= 8 {
            return Err("At most 8 browser pages can be open. Stop another page first.".into());
        }
        let status = Arc::new(Mutex::new(Status {
            id: id.clone(),
            url: url.clone(),
            ..Default::default()
        }));
        let page_status = status.clone();
        let title_status = status.clone();
        let browser_data = std::env::var_os("WEBVIEW2_USER_DATA_FOLDER")
            .map(std::path::PathBuf::from)
            .unwrap_or(app.path().app_local_data_dir().map_err(|e| e.to_string())?)
            .join("browsers");
        let builder = WebviewBuilder::new(
            format!("browser-{id}"),
            WebviewUrl::External("about:blank".parse().unwrap()),
        )
        .data_directory(browser_data)
        .incognito(true)
        .disable_drag_drop_handler()
        .on_navigation(|url| url.as_str() == "about:blank" || valid_url(url.as_str()))
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .on_download(|_, _| false)
        .on_permission_request(|_, _| PermissionResponse::Deny)
        .on_document_title_changed(move |_, title| {
            if let Ok(mut s) = title_status.lock() {
                s.title = title.chars().take(256).collect();
            }
        })
        .on_page_load(move |_, payload| {
            if let Ok(mut s) = page_status.lock() {
                s.url = payload.url().as_str().chars().take(4096).collect();
                s.loading = matches!(payload.event(), tauri::webview::PageLoadEvent::Started);
            }
        });
        let window = app.get_window("main").ok_or("Main window unavailable")?;
        // Async command + blocking worker avoids the synchronous WebView2 creation deadlock.
        let view = window
            .add_child(
                builder,
                LogicalPosition::new(0., 0.),
                LogicalSize::new(1., 1.),
            )
            .map_err(|e| e.to_string())?;
        let result = view
            .hide()
            .map_err(|e| e.to_string())
            .and_then(|_| secure(&view))
            .and_then(|_| {
                view.navigate(url.parse().unwrap())
                    .map_err(|e| e.to_string())
            });
        if let Err(error) = result {
            let _ = view.close();
            return Err(error);
        }
        sessions.insert(
            id,
            Session {
                view,
                status,
                applied: None,
            },
        );
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn browser_sync(
    state: tauri::State<'_, Arc<Browsers>>,
    surfaces: Vec<Surface>,
    node_ids: Vec<String>,
) -> Result<(), String> {
    if surfaces.len() > 8
        || node_ids.len() > 500
        || node_ids.iter().any(|id| !crate::workspace::id_valid(id))
    {
        return Err("Invalid browser surface list".into());
    }
    let mut seen = std::collections::HashSet::new();
    for surface in &surfaces {
        surface.validate()?;
        if !seen.insert(&surface.id) || !node_ids.contains(&surface.id) {
            return Err("Invalid or duplicate browser surface".into());
        }
    }
    with_browsers(state, move |sessions| {
        let removed: Vec<_> = sessions
            .keys()
            .filter(|id| !node_ids.contains(id))
            .cloned()
            .collect();
        for id in removed {
            if let Some(s) = sessions.get(&id) {
                s.view.close().map_err(|e| e.to_string())?;
            }
            sessions.remove(&id);
        }
        for (id, session) in sessions.iter_mut() {
            let surface = surfaces.iter().find(|s| &s.id == id && !s.clips.is_empty());
            let dpi = session
                .view
                .window()
                .scale_factor()
                .map_err(|e| e.to_string())?;
            if session
                .applied
                .as_ref()
                .is_some_and(|(previous, previous_dpi)| {
                    surface == Some(previous) && dpi == *previous_dpi
                })
            {
                continue;
            }
            // Hide while moving and clipping: native siblings must never flash over app chrome.
            session.view.hide().map_err(|e| e.to_string())?;
            session.applied = None;
            if let Some(s) = surface {
                session
                    .view
                    .set_bounds(tauri::Rect {
                        position: LogicalPosition::new(s.bounds.x, s.bounds.y).into(),
                        size: LogicalSize::new(s.bounds.width, s.bounds.height).into(),
                    })
                    .map_err(|e| e.to_string())?;
                session.view.set_zoom(s.zoom).map_err(|e| e.to_string())?;
                clip(&session.view, s)?;
                session.view.show().map_err(|e| e.to_string())?;
                session.applied = Some((s.clone(), dpi));
            }
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn browser_snapshot(
    state: tauri::State<'_, Arc<Browsers>>,
) -> Result<Vec<Status>, String> {
    with_browsers(state, |sessions| {
        sessions
            .values()
            .map(|s| {
                let mut status = s
                    .status
                    .lock()
                    .map_err(|_| "Browser status unavailable")?
                    .clone();
                status.url = s
                    .view
                    .url()
                    .map_err(|e| e.to_string())?
                    .as_str()
                    .chars()
                    .take(4096)
                    .collect();
                Ok(status)
            })
            .collect()
    })
    .await
}

#[tauri::command]
pub async fn browser_action(
    state: tauri::State<'_, Arc<Browsers>>,
    id: String,
    action: String,
) -> Result<(), String> {
    if !crate::workspace::id_valid(&id) || !matches!(action.as_str(), "back" | "forward" | "reload")
    {
        return Err("Invalid browser action".into());
    }
    with_browsers(state, move |sessions| {
        let view = &sessions.get(&id).ok_or("Open this page first")?.view;
        if action == "reload" {
            return view.reload().map_err(|e| e.to_string());
        }
        #[cfg(windows)]
        {
            platform(view, move |platform| unsafe {
                let core = platform
                    .controller()
                    .CoreWebView2()
                    .map_err(|e| e.to_string())?;
                if action == "back" {
                    core.GoBack()
                } else {
                    core.GoForward()
                }
                .map_err(|e| e.to_string())
            })
        }
        #[cfg(not(windows))]
        {
            Err("Browser nodes require Windows WebView2".into())
        }
    })
    .await
}

#[tauri::command]
pub async fn browser_close(
    state: tauri::State<'_, Arc<Browsers>>,
    id: String,
) -> Result<(), String> {
    if !crate::workspace::id_valid(&id) {
        return Err("Invalid browser node ID".into());
    }
    with_browsers(state, move |sessions| {
        if let Some(s) = sessions.get(&id) {
            s.view.close().map_err(|e| e.to_string())?;
        }
        sessions.remove(&id);
        Ok(())
    })
    .await
}
#[tauri::command]
pub async fn browser_close_all(state: tauri::State<'_, Arc<Browsers>>) -> Result<(), String> {
    with_browsers(state, |sessions| {
        let ids: Vec<_> = sessions.keys().cloned().collect();
        for id in ids {
            sessions[&id].view.close().map_err(|e| e.to_string())?;
            sessions.remove(&id);
        }
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fractional_dpi_clips_round_inward_and_drop_subpixel_slivers() {
        let r = Rect {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 80.0,
        };
        assert_eq!(physical_clip((0.4, 0.6), &r, 1.25), Some([0, 0, 124, 99]));
        let tiny = Rect {
            width: 0.01,
            height: 1.0,
            ..r
        };
        assert_eq!(physical_clip((0.4, 0.6), &tiny, 1.25), None);
    }
    #[test]
    fn navigation_is_bounded_http_only() {
        for value in [
            "https://example.com/a?q=1",
            "http://localhost:3000",
            "http://127.0.0.1:8080",
        ] {
            assert!(valid_url(value), "{value}");
        }
        for value in [
            "",
            "file:///C:/secret",
            "javascript:alert(1)",
            "data:text/html,test",
            "tauri://localhost",
            "http://ipc.localhost",
            "https://tauri.localhost/",
            "https://user:pass@example.com",
            "https://example.com/\n",
            "https://example.com\\a",
        ] {
            assert!(!valid_url(value), "{value}");
        }
        assert!(!valid_url(&format!(
            "https://example.com/{}",
            "x".repeat(4096)
        )));
    }
    #[test]
    fn clip_geometry_rejects_unbounded_or_outside_regions() {
        let mut s = Surface {
            id: "00000000-0000-4000-8000-000000000001".into(),
            bounds: Rect {
                x: -200.,
                y: 50.,
                width: 800.,
                height: 400.,
            },
            zoom: 0.5,
            clips: vec![Rect {
                x: 200.,
                y: 0.,
                width: 600.,
                height: 400.,
            }],
        };
        assert!(s.validate().is_ok());
        s.clips[0].width = 601.;
        assert!(s.validate().is_err());
        s.clips.clear();
        s.zoom = f64::NAN;
        assert!(s.validate().is_err());
    }
}
