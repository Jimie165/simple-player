# macOS 适配与测试

当前目标是 Intel（`x86_64-apple-darwin`）、macOS 12 及以上的基础运行。
适配代码仍需通过 macOS CI 编译并在 macOS 环境验收，不能把 Windows 检查通过当作 macOS 已验证。
Apple Silicon 代码路径已使用实际 target triple，但尚未提供 ARM sidecar 下载和构建任务，也未做实机测试。

## Windows 开发、云端构建、VMware 测试

1. 将 `macos-support` 分支提交并推送到 GitHub。
2. 在 Actions 中打开 **macOS Intel test build**，等待该分支的任务完成。
   后续修改相关文件并推送会自动构建，也可通过 Run workflow 手动选择分支。
3. 下载 `Simple-Player-macos-x86_64` artifact，解压外层 artifact ZIP。
4. 把里面的 `Simple-Player-macos-x86_64.zip` 传入 macOS，在 macOS 内解压并运行 `Simple Player.app`。
   应用 ZIP 由 `ditto` 创建，保留权限和包结构；不要在 Windows 上解开应用包后复制零散文件。

CI 使用 Intel runner、静态 FFmpeg/FFprobe 9.0.2 和固定下载校验值。
它运行 lint、媒体路径身份测试、Rust 格式/编译/测试，并生成 `.app` 测试包。
没有创建 GitHub Release，也不要求 Apple Developer 凭据。
测试包使用 ad-hoc 签名，没有 Developer ID 签名和公证，下载后可能被 Gatekeeper 拦截。
仅对自己构建并确认来源的测试包，按系统设置中的“仍要打开”流程处理；不要关闭全局安全检查。

## 当前行为

- 音频继续使用现有 rodio/CPAL 引擎；Windows 的 SMTC 保持原有行为，macOS 暂无系统“正在播放”及媒体键集成。
- macOS 视频缩略图使用随应用分发的 FFmpeg，视频扫描使用随应用分发的 FFprobe。
- 保留数据库中的 `/` 路径以及 `cache/...`、`data/...` 相对路径协议。
- macOS 数据放在 `~/Library/Application Support/SimplePlayer`，缓存放在 `~/Library/Caches/SimplePlayer`。
  Windows 原有目录与迁移流程保持不变；macOS 不执行 Windows 历史目录迁移。
- macOS 保留无边框窗口，关闭透明窗口；不启用 macOS 私有 API。
- 仅 Windows WebView2 使用自定义 WebView 数据目录，macOS 的 WKWebView 使用系统数据存储。
- 收藏、最近播放和转码缓存保留 macOS 路径大小写，避免混淆大小写敏感卷上的文件。

## 在 macOS 内本地构建（可选）

安装 Xcode Command Line Tools、Rust stable、Node.js 24 和 pnpm 11.11.0。
把对应架构的 FFmpeg/FFprobe 放入 `backend/tauri/binaries`，按该目录 README 命名并赋予执行权限。
Intel 构建命令：

```sh
pnpm install --frozen-lockfile
pnpm build --target x86_64-apple-darwin --bundles app
```

Tauri 自动合并 `backend/tauri/tauri.macos.conf.json`。
本地默认也可生成 DMG；CI 初期仅生成应用 ZIP，减少虚拟机测试前的打包工作。

## 验收清单

- 首次启动、关闭、再次打开，确认窗口、偏好、媒体库和队列恢复。
- 扫描包含中文和空格的目录；测试外接磁盘和文件权限提示。
- 播放 MP3、FLAC，测试暂停、切歌、拖动进度、歌词与音频输出设备切换。
- 测试 MP4 直放、MKV 转封装/转码、缩略图、全屏与缓存清理。
- 确认未安装 Homebrew/FFmpeg 的环境也能读取视频元数据和生成缩略图。
- 大小写敏感卷上同目录的 `Track.flac` 与 `track.flac` 应保持独立。
- 保留崩溃或命令错误日志；可在终端直接运行 `"Simple Player.app/Contents/MacOS/Simple Player"` 查看输出。

VMware 的音视频卡顿或硬件编码不可用，仍需在真实 Mac 上复核；Apple Silicon 需另行验收。

## 构建来源

- [Tauri macOS 应用包](https://v2.tauri.app/distribute/macos-application-bundle/)
- [Tauri sidecar 命名与打包](https://v2.tauri.app/develop/sidecar/)
- [Tauri macOS 签名与公证](https://v2.tauri.app/distribute/sign/macos/)
- [Intel FFmpeg 静态构建](https://evermeet.cx/ffmpeg/)

当前 FFmpeg 构建启用 GPL/version3。正式分发前应随包提供适用的许可证、第三方声明和相应源码获取方式；测试 artifact 不是正式发布包。
