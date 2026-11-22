#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
fn desktop_status() -> &'static str {
    "agatha-desktop-online"
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![desktop_status])
        .run(tauri::generate_context!())
        .expect("error while running Ágata ERP Desktop");
}
