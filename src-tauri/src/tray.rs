use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

const TRAY_ID: &str = "main-tray";
/// Black silhouette for macOS template (renders white on menubar).
const TRAY_ICON: Image<'_> = tauri::include_image!("icons/tray-icon.png");

pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "เปิด Sheets Reader", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "ซ่อนหน้าต่าง", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "ออกจากแอป", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hide, &quit])?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(TRAY_ICON)
        .icon_as_template(true)
        .menu(&menu)
        .tooltip("Sheets Reader")
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
                "show" => show_main_window(app),
                "hide" => hide_main_window(app),
                "quit" => {
                    app.exit(0);
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
