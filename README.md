# Simple Player

Simple Player 是一个基于 Tauri + React 的本地音乐/视频播放器，面向桌面端使用场景。支持媒体库管理、播放队列、播放列表与视频库等功能。

> **平台支持**：目前仅支持 **Windows**。

## 功能概览

- 本地音乐库扫描与管理
- 搜索（歌曲/艺人/专辑/视频）
- 播放控制与播放队列
- 播放列表（含收藏/喜爱歌曲）
- 视频库与视频播放
- 设置面板

## 技术栈

| 组件 | 版本/说明 |
|------|-----------|
| Tauri | 2.x |
| React | 19.x |
| Vite | 7.x |
| Rust | Edition 2024 |
| Zustand | 5.x |
| Tailwind CSS | 4.x |
| react-virtuoso | 4.x（虚拟列表） |
| FFmpeg / FFprobe | Windows sidecar 随应用打包 |

## 目录结构

```
simple-player/
├── frontend/                        # 前端应用（React + Vite）
│   └── src/
├── backend/
│   └── tauri/
│       ├── src/
│       │   ├── commands/            # Tauri 命令入口
│       │   └── modules/             # 后端核心模块
│       └── tauri.conf.json          # Tauri 应用配置
├── scripts/                         # 工具脚本（版本号管理等）
└── package.json
```

## 环境准备

- **操作系统**：Windows 10（1803+）或 Windows 11
- **Node.js**：$\ge$ 20.0.0 (推荐使用 LTS 版本)
- **pnpm**：项目使用 pnpm workspace，确保 pnpm 版本 $\ge$ 9.0.0
- **Rust 工具链**：`stable`（Tauri 构建依赖）
- **WebView2**：Windows 上 Tauri 的运行时依赖，通常系统已预装；若未安装请前往 [Microsoft 官网](https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/) 下载
- **FFmpeg/FFprobe sidecar（开发构建建议）**：
  - 参考 `backend/tauri/binaries/README.md`
  - 当前仓库默认使用 `backend/tauri/binaries/ffmpeg-<target-triple>.exe` 与 `ffprobe-<target-triple>.exe`

可选环境自检：

```bash
node -v
pnpm -v
rustc --version
```

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 启动开发模式（Tauri 桌面应用）
pnpm dev
```

## 常用脚本

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动 Tauri 开发模式 |
| `pnpm build` | 构建桌面应用（含前端打包） |
| `pnpm preview` | 仅预览前端（不启动 Tauri） |
| `pnpm lint` | 前端代码检查 |
| `pnpm bump` | 更新版本号 |

## 媒体格式支持（当前实现）

- 音频扫描扩展名：`mp3`、`flac`、`wav`、`ogg`、`m4a`
- 视频扫描扩展名：`mp4`、`mkv`、`avi`、`mov`、`webm`、`flv`、`m4v`、`3gp`、`ts`、`rmvb`、`wmv`、`asf`、`ogv`
- 说明：扩展名被扫描到不代表一定可原生播放；不兼容编码会在播放前触发封装转换或转码

## 构建与打包

```bash
pnpm build
```

构建完成后，Tauri 会在 `backend/tauri/target/release/bundle/` 下生成对应的安装包。

## 常见问题

详见 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)。

## 许可证

本项目以 [GPL-3.0](LICENSE) 许可证开源。

> 本应用随附打包了 FFmpeg / FFprobe 二进制文件，其以 LGPL/GPL 授权发布。为确保合规，本项目整体采用 GPL-3.0 协议。
