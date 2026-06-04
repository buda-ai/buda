# Buda Desktop Auto-Updater

在线自动升级模块，检查 GitHub Releases 中的 `latest.json` 并在发现新版本时提示用户升级。

## 工作原理

1. 应用启动后延迟 5 秒进行首次更新检查（避免阻塞启动）
2. 之后每 30 分钟周期性检查一次
3. 检查 `https://github.com/buda-ai/buda/releases/latest/download/latest.json`
4. 如果发现版本比当前版本新，弹窗询问用户是否升级
5. 用户确认后自动下载、安装并重启应用

触发时机参考了通知（notification）系统的设计模式：启动后延迟 + 定期轮询。

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
import { startAutoUpdate } from "./updater";

// 在应用初始化时启动自动更新（参考 notification 初始化位置）
startAutoUpdate();
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
| `startAutoUpdate()` | 启动自动更新生命周期（启动延迟 + 定期检查） |
| `stopAutoUpdate()` | 停止定期检查 |
| `checkForUpdate()` | 手动触发一次更新检查 |

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
