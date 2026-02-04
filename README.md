# Simple Player

Simple Player 是一个基于 Tauri + React 的本地音乐/视频播放器，面向桌面端使用场景。项目包含前端界面与后端本地能力，支持媒体库管理、搜索、播放队列、播放列表与视频库等功能。

**功能概览**
- 本地音乐库扫描与管理
- 搜索（歌曲/艺人/专辑/视频）
- 播放控制与播放队列
- 播放列表（含收藏/喜爱歌曲等）
- 视频库与视频播放
- 设置面板（包含与视频相关的管理项）

**技术栈**
- Tauri 2.x
- React 19 + Vite
- Zustand（状态管理）
- Tailwind CSS 4.x
- react-virtuoso（虚拟列表）
- ffmpeg / ffprobe（随应用打包的二进制）

**目录结构**
- `frontend/` 前端应用（React + Vite）
- `backend/tauri/` Tauri 后端与桌面配置
- `backend/tauri/src/commands/` Tauri 命令入口
- `backend/tauri/src/modules/` 后端核心模块（库扫描、视频、数据库等）
- `backend/tauri/tauri.conf.json` Tauri 应用配置与打包设置

**环境准备**
- Node.js（建议与前端依赖兼容的 LTS 版本）
- pnpm（项目使用 pnpm workspace 管理依赖）
- Rust 工具链（Tauri 构建依赖）
- 平台依赖：请根据系统安装 Tauri 官方文档要求的系统依赖

**快速开始**
1. 安装依赖
```bash
pnpm install
```
2. 启动开发环境（Tauri 桌面应用）
```bash
pnpm dev
```
该命令会启动前端 Vite 服务并启动 Tauri 桌面壳。

**常用脚本**
根目录脚本（`package.json`）：
- `pnpm dev` 启动 Tauri 开发模式
- `pnpm build` 构建桌面应用（含前端构建）
- `pnpm preview` 仅预览前端（不启动 Tauri）
- `pnpm lint` 前端代码检查

前端脚本（`frontend/package.json`）：
- `pnpm --filter frontend dev` 启动前端开发服务
- `pnpm --filter frontend build` 构建前端产物
- `pnpm --filter frontend preview` 预览前端产物

**配置说明**
- 应用基本信息与窗口设置：`backend/tauri/tauri.conf.json`
- 前端入口与路由：`frontend/src/App.tsx`
- 搜索结果视图：`frontend/src/features/search/SearchResultsView.tsx`
- 视频相关逻辑：`frontend/src/features/videos/` 与 `backend/tauri/src/commands/video.rs`

**开发建议**
- 列表渲染已使用虚拟化组件，继续保持对大数据量列表的性能关注
- 涉及异步请求和播放状态切换的逻辑建议补充错误提示与边界处理
- 建议补齐最小测试集，覆盖搜索、播放队列、播放列表的核心路径

**构建与打包**
```bash
pnpm build
```
构建完成后，Tauri 会按默认规则生成对应平台的安装包或可执行文件。

**常见问题排查**
- 端口占用：Tauri 开发模式默认使用 `http://localhost:5173`，确保端口可用
- 依赖安装失败：确认 Node.js 与 pnpm 版本
- 构建失败：确认 Rust 与平台依赖安装完整

**许可证**
ISC
