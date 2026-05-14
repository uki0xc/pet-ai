use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

#[tauri::command]
fn set_ignore_cursor(window: tauri::Window, ignore: bool) -> Result<(), String> {
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![set_ignore_cursor])
        .setup(|app| {
            // 构建托盘菜单
            let show_item = MenuItem::with_id(app, "show", "显示桌宠", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "隐藏桌宠", true, None::<&str>)?;
            let switch_pet_item =
                MenuItem::with_id(app, "switch_pet", "切换宠物", true, None::<&str>)?;
            let settings_item =
                MenuItem::with_id(app, "settings", "高级设置...", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出桌面宠物", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[
                    &show_item,
                    &hide_item,
                    &separator,
                    &switch_pet_item,
                    &settings_item,
                    &separator,
                    &quit_item,
                ],
            )?;

            // 加载专门的托盘图标（编译时嵌入，跨平台无依赖文件路径）
            let tray_icon = Image::from_bytes(include_bytes!("../icons/tray-icon.png"))?;

            // 创建托盘图标（Windows 任务栏托盘 / macOS 菜单栏）
            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(tray_icon)
                .icon_as_template(false) // 使用彩色图标，不作为模板图
                .tooltip("River Pet 🐱")
                .menu(&menu)
                .show_menu_on_left_click(false) // 左键单击发送事件，右键弹出菜单
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.hide();
                        }
                    }
                    "switch_pet" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.emit("tray://switch-pet", ());
                        }
                    }
                    "settings" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                            let _ = win.emit("tray://open-settings", ());
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            if win.is_visible().unwrap_or(false) {
                                let _ = win.hide();
                            } else {
                                let _ = win.show();
                                let _ = win.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
