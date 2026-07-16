# Simple Player

Simple Player 是一个基于 Tauri + React 的本地音乐/视频播放器，面向 Windows 桌面端使用场景。应用使用本地 SQLite 管理媒体库、播放列表和队列，用户的原始媒体文件不会被复制到应用数据目录。

> **平台支持**：目前仅支持 Windows。

## 功能概览

### 音乐库

- 添加多个本地音乐文件夹并扫描媒体
- 按歌曲、艺人和专辑浏览音乐库
- 搜索歌曲、艺人、专辑和视频
- 收藏歌曲、批量操作及最近播放记录
- 编辑歌曲标题、艺人、专辑和歌词等信息
- 配置全局或指定媒体文件夹的忽略目录

### 播放与歌词

- 播放、暂停、跳转、音量、随机播放和循环模式
- 播放队列持久化、临时插队和拖拽排序
- 普通歌词、时间轴歌词和逐字歌词显示
- 沉浸式播放器与响应式窄屏布局
- 音频输出设备选择
- Windows 系统媒体传输控制（SMTC）

### 播放列表与视频

- 创建、编辑、排序和删除播放列表
- 自定义播放列表名称、说明和封面
- 添加视频文件夹、生成缩略图并管理视频库
- 视频播放队列与收藏
- 对 WebView2 不兼容的媒体执行 MP4 重封装或转码
- 自动检测可用的硬件编码器，并在失败时回退到软件编码
- 查看、清理及配置转码缓存

### 外观与桌面体验

- 明暗主题及自定义主题颜色
- 自定义无边框窗口、窗口状态恢复和全屏播放
- 虚拟列表/网格，适配较大的本地媒体库

## 技术栈

| 组件 | 版本/说明 |
|---|---|
| Tauri | 2.x |
| React | 19.x |
| Vite | 7.x |
| TypeScript | 5.x，strict mode |
| Rust | Edition 2024 |
| Zustand | 5.x |
| Tailwind CSS | 4.x |
| SQLite | rusqlite，bundled SQLite |
| 音频 | rodio、cpal、symphonia |
| FFmpeg / FFprobe | Windows sidecar，随桌面安装包打包 |

依赖的准确版本以 `frontend/package.json` 和 `backend/tauri/Cargo.toml` 为准。

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

开发环境中的部分调用可以回退到系统 `PATH` 中的 `ffmpeg` / `ffprobe`，但 `pnpm build` 使用 Tauri `externalBin` 打包，必须提供按 target triple 命名的 sidecar。更多说明见 [`backend/tauri/binaries/README.md`](backend/tauri/binaries/README.md)。

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
| `pnpm bump <semver>` | 同步更新前端、后端和 Tauri 配置中的版本号 |

> 根目录的 `pnpm test` 当前是占位脚本，不是有效的测试命令。

## 媒体格式支持

当前扫描器识别以下扩展名：

- **音频**：`mp3`、`flac`、`wav`、`ogg`、`m4a`
- **视频**：`mp4`、`mkv`、`avi`、`mov`、`webm`、`flv`、`m4v`、`3gp`、`ts`、`rmvb`、`wmv`、`asf`、`ogv`

扩展名被扫描到不代表 WebView2 一定能够原生解码。应用会分析视频容器、视频编码和音频编码，并在需要时执行 MP4 重封装或转码。首次播放不兼容视频时可能需要等待处理完成。

## 数据与缓存

- 媒体库、播放列表、播放队列及部分后端设置存储在 Tauri App Data 下的 `library.db`。
- 封面、视频缩略图和默认转码文件存储在 Tauri App Cache 下。
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

## 常见问题

开发、扫描、播放和转码问题见 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)。

## 许可证

本项目以 [GPL-3.0](LICENSE) 许可证开源。

> 桌面安装包包含 FFmpeg / FFprobe 二进制文件。分发应用或替换这些二进制文件时，请同时遵守对应 FFmpeg 构建的 LGPL/GPL 许可要求。
