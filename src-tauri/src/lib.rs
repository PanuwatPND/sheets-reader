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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![fetch_sheets])
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
