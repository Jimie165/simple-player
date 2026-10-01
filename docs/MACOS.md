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

CI 使用 Intel runner、Rust 1.98.1、静态 FFmpeg/FFprobe 9.0.2 和固定下载校验值。
它运行 lint、媒体路径/图形回退偏好测试、Rust 格式检查、release 构建和 release 测试，并生成 `.app` 测试包。
构建与测试共用原生 Intel target 的 release 依赖，避免分别编译 check、debug 和显式 target 的依赖。
pnpm、Rust 依赖和 sidecar 均使用缓存；首次冷构建仍需下载、编译，后续命中缓存时才会更快。
同一分支的新构建会取消尚未完成的旧构建；应用 ZIP 上传时不再重复压缩。
没有创建 GitHub Release，也不要求 Apple Developer 凭据。
测试包使用 ad-hoc 签名，没有 Developer ID 签名和公证，下载后可能被 Gatekeeper 拦截。
仅对自己构建并确认来源的测试包，按系统设置中的“仍要打开”流程处理；不要关闭全局安全检查。

## 当前行为

- 音频继续使用现有 rodio/CPAL 引擎；macOS 音频和视频接入原生控制中心的“正在播放”，同步标题、歌手、专辑、封面、状态和进度，支持播放/暂停、切歌及拖动进度；Windows 的 SMTC 保持原有行为。
- macOS 视频缩略图使用随应用分发的 FFmpeg，视频扫描使用随应用分发的 FFprobe。
- 保留数据库中的 `/` 路径以及 `cache/...`、`data/...` 相对路径协议。
- macOS 数据放在 `~/Library/Application Support/SimplePlayer`，缓存放在 `~/Library/Caches/SimplePlayer`。
  Windows 原有目录与迁移流程保持不变；macOS 不执行 Windows 历史目录迁移。
- macOS 使用原生标题栏及系统红绿灯，关闭透明窗口；不启用 macOS 私有 API。
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
根目录脚本让 Tauri 自动发现 `backend/tauri`，不要把基础 `tauri.conf.json` 作为 `--config` 再次传入：该参数会在平台配置之后合并，覆盖 macOS 的原生标题栏和非透明窗口设置。
本地默认也可生成 DMG；CI 初期仅生成应用 ZIP，减少虚拟机测试前的打包工作。

## 虚拟机图形回退

不支持 backdrop-filter、WebGL 初始化失败或上下文丢失时自动回退；正在播放使用 CPU 预先模糊的静态封面和暗色遮罩，毛玻璃面板改为适合浅色/深色主题的实色背景。
静态背景不依赖 WebGL 或 CSS 模糊，切歌仍会更新封面。
自动检测结果仅对本次运行有效，重启后重新检测；不再提供或保存“简化视觉效果”的手动开关。虚拟机报告 API 可用却渲染异常的情况可能无法被自动检测。

macOS 使用 Overlay 原生红绿灯，隐藏系统标题文字及应用内自绘窗口按钮。
普通页面不增加横贯窗口的顶栏；原生红绿灯位于侧栏背景上，仅侧栏内部在窗口模式预留 40px，将返回按钮和应用图标下移。
正在播放页铺满窗口，左上角保留空位供红绿灯显示；视频页也铺满窗口，窗口模式将返回按钮和标题右移 80px，避开红绿灯。
系统全屏时移除侧栏预留高度，退出全屏后恢复；Windows 布局保持不变。
绿色按钮的全屏等行为由 macOS 管理，Windows 继续使用自绘按钮切换最大化/还原。
关闭正在播放页时保留此前从顶栏进入的 macOS 全屏；播放页自行进入的全屏会在关闭播放页时退出。
全屏尺寸不会覆盖下次启动使用的普通窗口尺寸。

## 验收清单

- 首次启动、关闭、再次打开，确认窗口、偏好、媒体库和队列恢复。
- 扫描包含中文和空格的目录；测试外接磁盘和文件权限提示。
- 播放 MP3、FLAC，测试暂停、切歌、拖动进度、歌词与音频输出设备切换。
- 从控制中心和键盘媒体键测试音频/视频的播放、暂停、上一首、下一首；切换音频与视频时确认封面、标题与控制目标同步，暂停及跳转后的进度正确。
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
