# 开发与构建

[返回 README](../README.md)

Simple Player 使用 Tauri、React、TypeScript、Vite、Rust、Zustand、Tailwind CSS、SQLite、rodio、cpal、symphonia 和 FFmpeg。准确依赖版本以 [前端配置](../frontend/package.json) 和 [Rust 配置](../backend/tauri/Cargo.toml) 为准。

## 目录结构

```text
simple-player/
├── frontend/                         # React + Vite 前端（simple-player-ui）
│   └── src/
│       ├── components/               # 通用 UI 和布局
│       ├── features/                 # 音乐库、播放器、播放列表、视频、设置等
│       ├── hooks/                    # 跨功能 hooks
│       ├── services/                 # Tauri API / invoke 封装
│       ├── store/                    # Zustand 状态与 actions
│       ├── types/                    # 共享类型
│       └── utils/                    # 歌词、路径、排序等工具
├── backend/
│   ├── Cargo.toml                    # Rust workspace
│   └── tauri/
│       ├── src/
│       │   ├── commands/             # Tauri command 入口
│       │   ├── modules/              # 数据库、媒体库、播放器和缓存模块
│       │   └── utils/                # 路径及 FFmpeg 工具
│       ├── binaries/                 # FFmpeg / FFprobe sidecar
│       ├── capabilities/             # Tauri 权限配置
│       └── tauri.conf.json           # Tauri 应用与打包配置
├── docs/                             # 使用及故障排查文档
├── scripts/                          # 版本更新等工具脚本
├── package.json                      # 根级开发/构建命令
└── pnpm-workspace.yaml
```

## 环境准备

- **操作系统**：Windows 10 或 Windows 11
- **Node.js**：`20.19+` 或 `22.12+`，建议使用当前 LTS 版本
- **pnpm**：`9.0+`
- **Rust**：stable 工具链，Windows MSVC target
- **WebView2**：Tauri 的 Windows 运行时依赖，Windows 10/11 通常已预装
- **FFmpeg/FFprobe**：视频扫描、缩略图和转码所需

环境自检：

```shell
node --version
pnpm --version
rustc --version
cargo --version
```

### 准备 FFmpeg/FFprobe

sidecar 可执行文件被 Git 忽略，不会随源码仓库提供。完整视频功能及桌面打包需要先准备对应 target triple 的文件，例如 64 位 MSVC 环境：

```text
backend/tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe
backend/tauri/binaries/ffprobe-x86_64-pc-windows-msvc.exe
```

开发环境中的部分调用可以回退到系统 `PATH` 中的 `ffmpeg` / `ffprobe`，但 `pnpm build` 使用 Tauri `externalBin` 打包，必须提供按 target triple 命名的 sidecar。更多说明见 [`backend/tauri/binaries/README.md`](../backend/tauri/binaries/README.md)。

## 快速开始

```shell
# 安装前端和 Tauri CLI 依赖
pnpm install

# 确认 FFmpeg/FFprobe 已放入 binaries/，然后启动桌面开发模式
pnpm dev
```

Vite 开发服务器固定使用 `5173` 端口；端口被占用时 `pnpm dev` 会启动失败。

## 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动 Vite 和 Tauri 桌面开发模式 |
| `pnpm build` | 构建前端并生成 Windows 桌面安装包 |
| `pnpm preview` | 预览前端构建；不启动 Tauri，原生能力不可完整使用 |
| `pnpm lint` | 运行前端 ESLint |
| `pnpm --filter simple-player-ui build` | 运行前端 TypeScript 检查并构建 |
| `cargo check --manifest-path backend/Cargo.toml` | 检查 Rust workspace |
| `cargo test --manifest-path backend/Cargo.toml` | 运行 Rust 测试 |
| `pnpm bump <类型或 semver>` | 以根 `package.json` 为版本源，同步更新前端包和 Tauri 配置 |
| `pnpm version:check` | 检查项目内所有版本号是否一致 |

版本号遵循 SemVer。正式版本使用 `pnpm bump major`、`pnpm bump minor` 或
`pnpm bump patch` 递增；预发布版本可使用 `premajor`、`preminor`、`prepatch`
和 `prerelease`，并通过 `--preid=alpha` 指定预发布通道。也可以传入完整版本号，
例如 `pnpm bump 1.0.0-beta.1`。脚本只修改版本文件，不自动提交、打标签或发布。

> 根目录的 `pnpm test` 当前是占位脚本，不是有效的测试命令。

## 数据与缓存

- 媒体库、播放列表、播放队列及部分后端设置存储在 `%APPDATA%/SimplePlayer/library.db`。
- 封面、视频缩略图和默认转码文件存储在 `%LOCALAPPDATA%/SimplePlayer/cache/`；WebView 的本地偏好也保存在 `%LOCALAPPDATA%/SimplePlayer/` 下。
- 首次启动时会复制原 `com.maho.simpleplayer` 目录的数据和缓存，保留旧目录，不覆盖已存在的 `SimplePlayer` 目录。迁移前请退出旧版应用；缓存较多时首次启动可能较慢。
- Rust 通过 managed state 中的 `AppDirectories` 获取路径，前端通过 `get_app_directories` command 获取同一组路径。Tauri 原生 `appDataDir` / `appCacheDir` 仍按应用标识解析，不用于本项目的媒体数据。
- 数据库中的应用生成文件使用 `cache/...` 或 `data/...` 相对路径，用户媒体文件保留原始绝对路径。
- 转码缓存目录和容量可以在应用设置中调整。

## 构建与打包

确保 sidecar 文件已准备完成，然后运行：

```shell
pnpm build
```

构建产物位于：

```text
backend/target/release/bundle/
├── msi/                              # MSI 安装包
└── nsis/                             # NSIS 安装包
```

前端的独立构建产物位于 `frontend/dist/`。
