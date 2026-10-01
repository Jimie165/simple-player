# ffmpeg sidecar 放置说明

本项目使用 Tauri sidecar 方式调用 ffmpeg/ffprobe，用于将 MKV 转封装/转码为 WebView 可播放的 MP4。

请将 Windows 预编译版的可执行文件放在本目录，并按 Tauri 的 target triple 命名：

- ffmpeg-<target-triple>.exe
- ffprobe-<target-triple>.exe

开发和打包均应准备上述 sidecar 文件，不依赖系统 PATH。

macOS 测试构建使用对应架构的可执行文件：

- Intel：`ffmpeg-x86_64-apple-darwin`、`ffprobe-x86_64-apple-darwin`
- Apple Silicon：`ffmpeg-aarch64-apple-darwin`、`ffprobe-aarch64-apple-darwin`

文件必须具有可执行权限；发布包不能依赖测试机安装 Homebrew 或 FFmpeg。
`.github/workflows/macos.yml` 下载固定版本并校验 SHA-256，目前只生成 Intel 测试包。
视频扫描和缩略图通过应用的 sidecar 路径解析函数查找工具，不能仅依赖系统 PATH。

这些 macOS 二进制文件不提交到仓库。测试与开发步骤见 [macOS 适配说明](../../../docs/MACOS.md)。
