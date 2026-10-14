# macOS 使用说明

[返回 README](../README.md)

Simple Player 的 macOS 版本仍在开发中，目前仅通过 [GitHub Actions](https://github.com/Jimie165/simple-player/actions/workflows/macos.yml) 提供测试构建。正式版本将在完成全面适配后发布。

## 系统要求

- macOS 12 或更高版本。
- Intel 或 Apple Silicon Mac，下载时需选择对应架构。
- 视频处理所需的 FFmpeg 和 FFprobe 随应用提供，无需另外安装。

## 下载与安装

打开 [macOS 构建页面](https://github.com/Jimie165/simple-player/actions/workflows/macos.yml)，选择 `macos-support` 分支下成功完成的手动构建记录，在页面底部的 **Artifacts** 中下载。自动检查任务不提供安装包。

在“关于本机”中查看芯片或处理器信息，按下表选择：

| 设备 | 应用 ZIP | DMG 安装包 |
| --- | --- | --- |
| Intel Mac | `Simple-Player-macos-x86_64` | `Simple-Player-macos-x86_64-DMG` |
| Apple Silicon Mac | `Simple-Player-macos-aarch64` | `Simple-Player-macos-aarch64-DMG` |

下载后的文件是 GitHub 打包的 artifact ZIP，请先解压，再使用其中的应用压缩包或 DMG：

- **应用 ZIP**：在 macOS 中解压内部的 `Simple-Player-macos-<架构>.zip`，打开 `Simple Player.app`。也可以将应用移至“应用程序”。
- **DMG**：打开其中的 `.dmg`，将 `Simple Player.app` 拖入“应用程序”，然后启动。

请完整保留 `.app` 应用包。两种分发格式使用相同的数据和缓存目录，更新应用时可替换旧的应用包。

测试构建产物保留 14 天；过期后需等待新的手动构建。

### 首次启动

当前测试包使用临时签名（ad-hoc），尚未进行 Developer ID 签名和 Apple 公证，首次打开可能出现系统安全提示。请确认下载来源，并按 macOS 提示在系统设置中允许打开该应用。

## 平台功能

### 窗口与全屏

应用使用 macOS 原生红绿灯按钮。绿色按钮的全屏行为由系统管理。

正在播放页隐藏红绿灯，右上角提供进入或退出全屏的按钮；关闭播放页后恢复原生窗口按钮。视频页保留原生红绿灯，返回按钮和标题会避开窗口按钮区域。

### 系统媒体控制

音乐和视频接入控制中心的“正在播放”，显示媒体标题、封面、播放状态和进度，并支持播放、暂停、切换曲目及调整进度。

音频输出设备可在应用设置中选择。

### 视频播放

应用使用系统 WKWebView 播放视频。无法直接播放的文件会先通过随应用提供的 FFmpeg 重封装或转码，首次准备可能需要等待；后续播放可复用缓存。

容器扩展名并不代表编码兼容性。例如，同为 MKV 的文件可能只需重封装，也可能需要转码。

转码缓存的位置和容量上限可在设置中调整。

## 数据与缓存

| 内容 | 默认目录 |
| --- | --- |
| 媒体库、歌单等应用数据 | `~/Library/Application Support/SimplePlayer` |
| 封面、缩略图等缓存 | `~/Library/Caches/SimplePlayer` |
| 视频转码缓存 | `~/Library/Caches/SimplePlayer/cache/transcoded_videos` |

`~` 代表当前用户的主目录。`Library` 默认隐藏，可在 Finder 中选择“前往 → 前往文件夹”，输入上述路径打开。

应用 ZIP 和 DMG 安装后的应用均使用这些目录，数据不会保存在应用包内。替换或删除应用包不会自动清除这些目录；请勿将应用数据目录作为普通缓存删除。

## 问题反馈

请通过 [GitHub Issues](https://github.com/Jimie165/simple-player/issues) 提交问题，并尽量提供：

- 应用版本或测试构建记录。
- macOS 版本及设备架构（Intel / Apple Silicon）。
- 复现步骤、预期结果和实际表现。
- 错误文字、截图或相关日志。
- 涉及播放时，补充媒体容器格式、视频或音频编码，以及问题发生在直接播放还是转码后。

更多常见问题见 [故障排查](TROUBLESHOOTING.md)。
