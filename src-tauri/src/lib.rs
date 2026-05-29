mod sheets;
mod tray;

use sheets::{FetchResult, MultiFetchResult};
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

struct AppState {
    service_account_path: std::sync::Mutex<String>,
}

#[tauri::command]
async fn fetch_sheets(
    spreadsheet_input: String,
    sheet_tabs: String,
    cell_range: String,
    read_mode: String,
    state: State<'_, AppState>,
) -> Result<MultiFetchResult, String> {
    let tabs = sheets::parse_tab_names(&sheet_tabs);
    match read_mode.as_str() {
        "publicLink" => sheets::fetch_public_tabs(&spreadsheet_input, &tabs).await,
        "serviceAccount" => {
            let path = state
                .service_account_path
                .lock()
                .map_err(|_| "internal error")?
                .clone();
            if path.is_empty() {
                return Err("เลือกไฟล์ Service Account JSON ก่อน".into());
            }
            sheets::fetch_service_account_tabs(
                &spreadsheet_input,
                &path,
                &tabs,
                &cell_range,
            )
            .await
        }
        _ => Err("โหมดอ่านไม่ถูกต้อง".into()),
    }
}

#[tauri::command]
async fn fetch_public_sheet(spreadsheet_input: String) -> Result<FetchResult, String> {
    sheets::fetch_public(&spreadsheet_input).await
}

#[tauri::command]
async fn fetch_service_account_sheet(
    spreadsheet_input: String,
    range: String,
    state: State<'_, AppState>,
) -> Result<FetchResult, String> {
    let path = state
        .service_account_path
        .lock()
        .map_err(|_| "internal error")?
        .clone();
    if path.is_empty() {
        return Err("เลือกไฟล์ Service Account JSON ก่อน".into());
    }
    sheets::fetch_service_account(&spreadsheet_input, &path, &range).await
}

#[tauri::command]
fn set_service_account_path(path: String, state: State<'_, AppState>) {
    if let Ok(mut guard) = state.service_account_path.lock() {
        *guard = path;
    }
}

#[tauri::command]
fn get_service_account_path(state: State<'_, AppState>) -> String {
    state
        .service_account_path
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

#[tauri::command]
async fn pick_service_account_file(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .set_title("เลือกไฟล์ Service Account JSON")
        .blocking_pick_file();

    if let Some(file) = path {
        let path_str = file.to_string();
        if let Ok(mut guard) = state.service_account_path.lock() {
            *guard = path_str.clone();
        }
        Ok(Some(path_str))
    } else {
        Ok(None)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            service_account_path: std::sync::Mutex::new(String::new()),
        })
        .invoke_handler(tauri::generate_handler![
            fetch_sheets,
            fetch_public_sheet,
            fetch_service_account_sheet,
            set_service_account_path,
            get_service_account_path,
            pick_service_account_file,
        ])
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
