use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[tauri::command]
fn set_ignore_cursor(window: tauri::Window, ignore: bool) -> Result<(), String> {
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| e.to_string())
}

/// 获取鼠标相对当前窗口的逻辑像素坐标。
/// 即使窗口启用 ignore_cursor_events 时也能正常获取，用于"仅猫咪本体可点击"的命中检测。
#[tauri::command]
fn get_cursor_pos(app: tauri::AppHandle, window: tauri::Window) -> Result<(f64, f64), String> {
    let cursor = app.cursor_position().map_err(|e| e.to_string())?;
    let win_pos = window.outer_position().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let rel_x = (cursor.x - win_pos.x as f64) / scale;
    let rel_y = (cursor.y - win_pos.y as f64) / scale;
    Ok((rel_x, rel_y))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // 单实例守护：第二次启动时直接聚焦已运行的桌宠，禁止开多个
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        // Cmd/Ctrl + Shift + P : 切换桌宠显示/隐藏
                        let toggle = Shortcut::new(
                            Some(Modifiers::SUPER | Modifiers::SHIFT),
                            Code::KeyP,
                        );
                        let toggle_ctrl = Shortcut::new(
                            Some(Modifiers::CONTROL | Modifiers::SHIFT),
                            Code::KeyP,
                        );
                        if shortcut == &toggle || shortcut == &toggle_ctrl {
                            if let Some(win) = app.get_webview_window("main") {
                                if win.is_visible().unwrap_or(false) {
                                    let _ = win.hide();
                                } else {
                                    let _ = win.show();
                                    let _ = win.set_focus();
                                }
                            }
                        }

                        // Cmd/Ctrl + Shift + L : 切换宠物品种
                        let switch = Shortcut::new(
                            Some(Modifiers::SUPER | Modifiers::SHIFT),
                            Code::KeyL,
                        );
                        let switch_ctrl = Shortcut::new(
                            Some(Modifiers::CONTROL | Modifiers::SHIFT),
                            Code::KeyL,
                        );
                        if shortcut == &switch || shortcut == &switch_ctrl {
                            if let Some(win) = app.get_webview_window("main") {
                                let _ = win.emit("tray://switch-pet", ());
                            }
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![set_ignore_cursor, get_cursor_pos])
        .setup(|app| {
            // 注册全局快捷键
            #[cfg(desktop)]
            {
                let toggle_super = Shortcut::new(
                    Some(Modifiers::SUPER | Modifiers::SHIFT),
                    Code::KeyP,
                );
                let toggle_ctrl = Shortcut::new(
                    Some(Modifiers::CONTROL | Modifiers::SHIFT),
                    Code::KeyP,
                );
                let switch_super = Shortcut::new(
                    Some(Modifiers::SUPER | Modifiers::SHIFT),
                    Code::KeyL,
                );
                let switch_ctrl = Shortcut::new(
                    Some(Modifiers::CONTROL | Modifiers::SHIFT),
                    Code::KeyL,
                );
                let _ = app.global_shortcut().register(toggle_super);
                let _ = app.global_shortcut().register(toggle_ctrl);
                let _ = app.global_shortcut().register(switch_super);
                let _ = app.global_shortcut().register(switch_ctrl);
            }

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
