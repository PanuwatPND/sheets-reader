mod sheets;
mod tray;

use sheets::MultiFetchResult;
use tauri::Manager;

#[tauri::command]
async fn fetch_sheets(
    spreadsheet_input: String,
    sheet_tabs: String,
) -> Result<MultiFetchResult, String> {
    let tabs = sheets::parse_tab_names(&sheet_tabs);
    sheets::fetch_public_tabs(&spreadsheet_input, &tabs).await
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_tray_icon_data(app: tauri::AppHandle, rgba: Option<Vec<u8>>, width: u32, height: u32) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        match rgba {
            Some(data) => {
                let img = tauri::image::Image::new_owned(data, width, height);
                let _ = tray.set_icon(Some(img));
                let _ = tray.set_icon_as_template(false);
            }
            None => {
                let original: tauri::image::Image<'_> = tauri::include_image!("icons/tray-icon.png");
                let _ = tray.set_icon(Some(original));
                let _ = tray.set_icon_as_template(true);
            }
        }
    }
}

#[tauri::command]
fn show_notification(title: String, body: String) {
    // Sanitize: AppleScript strings can't contain raw quotes or backslashes
    let safe_title = title.replace('"', "'").replace('\\', "");
    let safe_body = body.replace('"', "'").replace('\\', "");
    let script = format!(
        "display notification \"{safe_body}\" with title \"{safe_title}\""
    );
    let _ = std::process::Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .spawn();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_sheets, open_url, show_notification, set_tray_icon_data])
        .setup(|app| {
            tray::setup_tray(app.handle())?;

            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_clone.hide();
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
