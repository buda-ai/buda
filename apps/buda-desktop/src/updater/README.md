# Buda Desktop Auto-Updater

在线自动升级模块，静默检查 GitHub Releases 中的 `latest.json`，发现新版本时通过小红点提示用户，由用户主动点击升级按钮触发更新。

## 工作原理

1. 应用启动后延迟 10 秒进行首次更新检查（避免阻塞启动）
2. 之后每 1 小时周期性静默检查一次
3. 检查 `https://github.com/buda-ai/buda/releases/latest/download/latest.json`
4. 如果发现版本比当前版本新，更新内部状态并通知 UI 显示小红点
5. 用户点击升级按钮后，弹窗确认，然后自动下载、安装并重启应用

**不会主动弹出升级对话框**，仅在 UI 上展示红点提示。

## 集成方式

### 1. 安装 Tauri 插件依赖

```bash
# Rust 端
cargo add tauri-plugin-updater tauri-plugin-dialog tauri-plugin-process

# 前端
npm install @tauri-apps/plugin-updater @tauri-apps/plugin-dialog @tauri-apps/plugin-process
```

### 2. 注册 Tauri 插件 (src-tauri/src/main.rs)

```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        // ... 其他插件
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 3. 配置 tauri.conf.json

在 `tauri.conf.json` 的 `plugins` 字段中添加 updater 配置：

```json
{
  "plugins": {
    "updater": {
      "active": true,
      "dialog": false,
      "endpoints": [
        "https://github.com/buda-ai/buda/releases/latest/download/latest.json"
      ]
    }
  }
}
```

> 设置 `"dialog": false` 以使用自定义的前端对话框而非系统默认对话框。

### 4. 在应用入口调用

```typescript
import { startAutoUpdate, onUpdateAvailable, performUpdate } from "./updater";

// 启动静默检查
startAutoUpdate();

// 订阅更新状态，用于显示/隐藏小红点
onUpdateAvailable((info) => {
  if (info.available) {
    // 显示小红点，例如：
    showUpgradeBadge(true, info.version);
  } else {
    showUpgradeBadge(false);
  }
});

// 用户点击升级按钮时调用
upgradeButton.addEventListener("click", () => {
  performUpdate();
});
```

### 5. 权限配置 (src-tauri/capabilities/default.json)

```json
{
  "permissions": [
    "updater:default",
    "dialog:default",
    "process:default"
  ]
}
```

## API

| 函数 | 说明 |
|------|------|
| `startAutoUpdate()` | 启动自动更新生命周期（启动延迟 + 每小时静默检查） |
| `stopAutoUpdate()` | 停止定期检查 |
| `checkForUpdate()` | 手动触发一次静默检查（仅更新状态，不弹窗） |
| `getUpdateInfo()` | 获取当前更新状态（是否有新版本、版本号、更新日志） |
| `onUpdateAvailable(listener)` | 订阅更新状态变化，返回取消订阅函数 |
| `performUpdate()` | 用户主动触发升级（弹窗确认 → 下载安装 → 重启） |

## latest.json 格式

由 CI/CD 构建流程自动生成并上传到 GitHub Release，格式遵循 Tauri updater 标准：

```json
{
  "version": "0.2.0",
  "notes": "更新说明...",
  "pub_date": "2026-06-03T20:39:53.864Z",
  "platforms": {
    "linux-x86_64": { "signature": "...", "url": "..." },
    "windows-x86_64": { "signature": "...", "url": "..." },
    "darwin-aarch64": { "signature": "...", "url": "..." }
  }
}
```
