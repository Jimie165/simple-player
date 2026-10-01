# macOS 适配与测试

当前构建目标是 Intel（`x86_64-apple-darwin`）和 Apple Silicon（`aarch64-apple-darwin`），支持 macOS 12 及以上。
适配代码仍需通过 macOS CI 编译并在 macOS 环境验收，不能把 Windows 检查通过当作 macOS 已验证。
Intel 版本已在 VMware 中完成基础功能测试；Apple Silicon 已提供 ARM64 sidecar 下载和构建任务，仍需 CI 构建及真实设备验收。

## Windows 开发、云端构建

1. 将 `macos-support` 分支提交并推送到 GitHub。
2. 在 Actions 中打开 **macOS checks and builds**，通过 **Run workflow** 选择该分支并手动运行，等待两种架构的打包任务完成。
   修改相关文件并推送只会自动运行 lint、TypeScript 类型检查、前端定向测试和 Rust 格式检查；需要新安装包时再手动运行。
3. Intel 下载 `Simple-Player-macos-x86_64`（应用 ZIP）或 `Simple-Player-macos-x86_64-DMG`（安装包）；Apple Silicon 下载对应的 `Simple-Player-macos-aarch64` 或 `Simple-Player-macos-aarch64-DMG`。解压外层 artifact ZIP。
4. 应用 ZIP：将里面的 `Simple-Player-macos-<架构>.zip` 传入对应架构的 macOS，在 macOS 内解压并直接运行 `Simple Player.app`。
   DMG：将里面的 `.dmg` 文件传入 macOS，双击打开，将 `Simple Player.app` 拖入 `Applications`，然后从“应用程序”启动。
   两种格式都保留应用权限和包结构；不要拆开应用包后复制零散文件。应用 ZIP 直接运行时，数据仍使用系统的应用数据和缓存目录。

CI 使用 `macos-15-intel` 和 `macos-15` ARM64 原生 runner、Rust 1.98.1；Intel 使用 Evermeet 静态 FFmpeg/FFprobe 9.0.2，Apple Silicon 使用 OSXExperts 静态 9.0，两者均固定下载校验值。
自动检查和手动打包都会运行 lint、TypeScript 类型检查、媒体路径/图形回退及媒体控制测试和 Rust 格式检查。
只有手动运行才准备 sidecar、执行 release 构建及 Rust release 测试，并生成应用 ZIP 和 DMG 安装包；自动推送检查不编译 Rust 后端。
日常推送只运行一次 Intel 检查，手动打包并行运行两种架构，分别缓存依赖和 sidecar；一个架构失败不会自动取消另一个。
每种架构的构建与测试共用原生 target 的 release 依赖，避免分别编译 check、debug 和显式 target 的依赖。
pnpm、Rust 依赖和 sidecar 均使用缓存；首次冷构建仍需下载、编译，后续命中缓存时才会更快。
同一分支的新自动检查会取消旧自动检查，新手动打包会取消旧手动打包；推送不会取消正在执行的手动打包。应用 ZIP 和 DMG 上传时不再重复压缩。
没有创建 GitHub Release，也不要求 Apple Developer 凭据。
测试包使用 ad-hoc 签名，没有 Developer ID 签名和公证，下载后可能被 Gatekeeper 拦截。
仅对自己构建并确认来源的测试包，按系统设置中的“仍要打开”流程处理；不要关闭全局安全检查。

## 当前行为

- 音频继续使用现有 rodio/CPAL 引擎；macOS 音频和视频接入原生控制中心的“正在播放”，同步标题、歌手、专辑、封面、状态和进度，支持播放/暂停、切歌及拖动进度；Windows 的 SMTC 保持原有行为。
- macOS 视频缩略图使用随应用分发的 FFmpeg，视频扫描使用随应用分发的 FFprobe。
- MKV 准备完成前不加载原始视频；HEVC 重封装使用 `hvc1` 标记及 faststart。新兼容流程使用独立缓存键，不会复用旧的 macOS 重封装/转码结果。
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

在 Apple Silicon Mac 上准备 ARM64 sidecar 后，可运行 `pnpm build --target aarch64-apple-darwin --bundles app,dmg`。

Tauri 自动合并 `backend/tauri/tauri.macos.conf.json`。
根目录脚本让 Tauri 自动发现 `backend/tauri`，不要把基础 `tauri.conf.json` 作为 `--config` 再次传入：该参数会在平台配置之后合并，覆盖 macOS 的原生标题栏和非透明窗口设置。
本地默认也可生成 DMG；CI 使用 `pnpm build --bundles app,dmg`，在同一次编译后生成应用和 DMG，并用 `ditto` 将应用归档为 ZIP，分别上传两种产物。

## 图形回退

不支持 backdrop-filter、WebGL 初始化失败或上下文丢失时自动回退；正在播放使用 CPU 预先模糊的静态封面和暗色遮罩，毛玻璃面板改为适合浅色/深色主题的实色背景。
静态背景不依赖 WebGL 或 CSS 模糊，切歌仍会更新封面。
自动检测结果仅对本次运行有效，重启后重新检测；不再提供或保存“简化视觉效果”的手动开关。虚拟机报告 API 可用却渲染异常的情况可能无法被自动检测。

macOS 使用 Overlay 原生红绿灯，隐藏系统标题文字及应用内自绘窗口按钮。
普通页面不增加横贯窗口的顶栏；原生红绿灯位于侧栏背景上，仅侧栏内部在窗口模式预留 32px，将返回按钮和应用图标下移。
正在播放页铺满窗口并隐藏原生红绿灯，右上角保留进入/退出全屏按钮；关闭播放页后恢复红绿灯。视频页也铺满窗口，窗口模式将返回按钮和标题右移 80px，避开红绿灯。
系统全屏时移除侧栏预留高度，退出全屏后恢复；Windows 布局保持不变。
绿色按钮的全屏等行为由 macOS 管理，Windows 继续使用自绘按钮切换最大化/还原。
关闭正在播放页时保留此前从顶栏进入的 macOS 全屏；播放页自行进入的全屏会在关闭播放页时退出。
全屏尺寸不会覆盖下次启动使用的普通窗口尺寸。

## 验收清单

- 首次启动、关闭、再次打开，确认窗口、偏好、媒体库和队列恢复。
- 扫描包含中文和空格的目录；测试外接磁盘和文件权限提示。
- 播放 MP3、FLAC，测试暂停、切歌、拖动进度、歌词与音频输出设备切换。
- 从控制中心和键盘媒体键测试音频/视频的播放、暂停、上一首、下一首；切换音频与视频时确认封面、标题与控制目标同步，暂停及跳转后的进度正确。
- 视频开始播放后立即从控制中心暂停/继续，连续切换视频，确认播放图标和缩略图跟随当前视频；等待缩略图生成后无需暂停或跳转也应更新。
- 同一路径添加到音乐库和视频库后，在该目录新增 FLAC 并刷新；两个目录列表均应保留该路径。移除其中一种归属不应影响另一种库。
- 测试 MP4 直放、MKV 转封装/转码、缩略图、全屏与缓存清理。
- 测试 H.264 MKV、HEVC MKV：准备完成后播放，第二次播放复用缓存。若失败，记录界面显示的 FFmpeg/FFprobe 错误文字。
- 确认未安装 Homebrew/FFmpeg 的环境也能读取视频元数据和生成缩略图。
- 大小写敏感卷上同目录的 `Track.flac` 与 `track.flac` 应保持独立。
- 保留崩溃或命令错误日志；可在终端直接运行 `"Simple Player.app/Contents/MacOS/Simple Player"` 查看输出。


## 构建来源

- [Tauri macOS 应用包](https://v2.tauri.app/distribute/macos-application-bundle/)
- [Tauri sidecar 命名与打包](https://v2.tauri.app/develop/sidecar/)
- [Tauri macOS 签名与公证](https://v2.tauri.app/distribute/sign/macos/)
- [Intel FFmpeg 静态构建](https://evermeet.cx/ffmpeg/)
- [Apple Silicon FFmpeg 静态构建](https://www.osxexperts.net/index.html)
- [GitHub runner 架构和标签](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)

当前 FFmpeg 构建启用 GPL/version3。正式分发前应随包提供适用的许可证、第三方声明和相应源码获取方式；测试 artifact 不是正式发布包。
