#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            catalog::load_catalog,
            catalog::sync_catalog,
            catalog::open_catalog_file
        ])
        .run(tauri::generate_context!())
        .expect("Não foi possível iniciar Links Úteis DONATO");
}
mod catalog;
