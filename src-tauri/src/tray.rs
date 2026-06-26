use tauri::{
    image::Image,
    menu::{IconMenuItem, Menu, NativeIcon, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

const TRAY_ID: &str = "main-tray";
/// Black silhouette for macOS template (renders white on menubar).
const TRAY_ICON: Image<'_> = tauri::include_image!("icons/tray-icon.png");

pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show = IconMenuItem::with_id_and_native_icon(app, "show", "Open", true, Some(NativeIcon::EnterFullScreen), None::<&str>)?;
    let refresh = IconMenuItem::with_id_and_native_icon(app, "refresh", "Refresh", true, Some(NativeIcon::Refresh), None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let hide = PredefinedMenuItem::hide(app, Some("Hide"))?;
    let quit = PredefinedMenuItem::quit(app, Some("Quit"))?;
    let menu = Menu::with_items(app, &[&show, &refresh, &sep, &hide, &quit])?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(TRAY_ICON)
        .icon_as_template(true)
        .menu(&menu)
        .tooltip("Sheets Reader")
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "show" => show_main_window(app),
                "refresh" => {
                    let _ = app.emit("tray-refresh", ());
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                toggle_main_window(app);
            }
        })
        .build(app)?;

    Ok(())
}

pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn hide_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

pub fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(true);
        if visible {
            let _ = window.hide();
        } else {
            show_main_window(app);
        }
    }
}
