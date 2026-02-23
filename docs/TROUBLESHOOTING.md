# 常见问题诊断 (Troubleshooting)

本文档汇总了 Simple Player 使用过程中可能遇到的常见问题及解决方案。

---

## 1. 应用无法启动

### 窗口无法显示或启动后立即崩溃

- **原因（Windows）**：Tauri 依赖 WebView2 运行时，若系统未安装则无法启动。
- **解决**：
  1. 前往 [Microsoft WebView2 下载页](https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/) 下载并安装"常青版独立安装程序"。
  2. 安装完成后重新启动应用。
- **提示**：Windows 10 1803+ / Windows 11 通常已预装 WebView2，若仍报错可尝试修复安装。

---

## 2. 媒体扫描问题

### 扫描卡住或遗漏文件

- **检查**：确认文件路径是否包含特殊字符，或所在目录是否有权限限制。
- **原因**：部分音频文件的元数据编码（如 GBK）可能导致解析失败。
- **解决**：
  1. 先执行一次“刷新音乐库/刷新视频库”。
  2. 若你在开发模式（`pnpm dev`）运行，可打开开发者控制台（`Ctrl+Shift+I`）查看具体报错文件。
  3. 确认目标目录对当前用户可读，并排除被其他程序独占的文件。

### 视频无法被扫描

- **检查**：确认扩展名是否在当前扫描器支持列表内。
- **当前支持的视频扩展名**：
  `mp4`、`mkv`、`avi`、`mov`、`webm`、`flv`、`m4v`、`3gp`、`ts`、`rmvb`、`wmv`、`asf`、`ogv`
- **说明**：不在列表中的扩展名会被扫描器跳过。

---

## 3. 播放与转码

### 视频播放失败或黑屏

- **解决**：
  1. 在设置页查看当前“硬件加速”状态（自动检测结果）。
  2. 尝试“清空转码缓存”后重新播放目标视频。
  3. 重新扫描视频库后再试一次。
- **提示**：
  - 当前版本硬件加速为自动检测与自动回退，暂不提供手动开关。
  - 本应用依赖 Chromium 内核（WebView2）进行播放；部分不兼容编码（如某些 HEVC 变体）会先转码，首次播放可能需要等待。

### 转码速度慢

- **说明**：转码器会自动优先尝试硬件编码（如 NVENC / QSV），失败时自动回退到软件编码（CPU）。
- **建议**：
  1. 在设置页确认当前检测到的硬件编码类型。
  2. 更新显卡驱动，关闭占用编码器的其他软件后重试。
  3. 若显示为软件编码（CPU），转码速度较慢属于预期现象。

### 播放时报 `ffmpeg` / `ffprobe` 相关错误

- **检查**：
  1. 开发环境下确认 `backend/tauri/binaries/` 存在对应平台的可执行文件。
  2. 文件命名需符合 `ffmpeg-<target-triple>.exe` / `ffprobe-<target-triple>.exe`。
- **说明**：可参考 `backend/tauri/binaries/README.md` 的 sidecar 放置规范。

---

## 4. 界面与交互

### 新建播放列表无反应

- **检查**：
  1. 在设置页“关于”确认当前版本号。
  2. 重启应用后重试，确认是否仍可稳定复现。
- **说明**：若问题可稳定复现，请记录操作路径（点击顺序、是否有遮罩层等）便于定位。

### 快捷键无效

- **原因**：部分全局快捷键可能与其他正在运行的软件冲突。
- **解决**：确保应用窗口处于激活状态（非全局快捷键需要窗口焦点）。

---

## 5. 开发相关

### `pnpm dev` 启动失败

**错误：`failed to run cargo build`**

1. 确认 Rust 环境正常：`rustc --version`
2. 确认 Node / pnpm 版本可用：`node -v`、`pnpm -v`
3. 确认 WebView2 已安装（见第 1 节）。
4. 尝试删除编译缓存后重试：
   ```bash
   Remove-Item -Recurse -Force backend\tauri\target
   pnpm dev
   ```

**错误：端口占用（`address already in use: 5173`）**

- Vite 开发服务器默认使用 `5173` 端口，确保该端口未被其他程序占用。
- 可用以下命令定位并结束占用进程（PowerShell）：
  ```powershell
  Get-NetTCPConnection -LocalPort 5173 | Select-Object OwningProcess
  Stop-Process -Id <PID> -Force
  ```

---

如果问题仍未解决，请至少整理：环境信息（Windows 版本、Node/pnpm/Rust 版本）和可复现步骤，再提交反馈。
