# ffmpeg sidecar 放置说明

本项目使用 Tauri sidecar 方式调用 ffmpeg/ffprobe，用于将 MKV 转封装/转码为 WebView 可播放的 MP4。

请将 Windows 预编译版的可执行文件放在本目录，并按 Tauri 的 target triple 命名：

- ffmpeg-<target-triple>.exe
- ffprobe-<target-triple>.exe

开发时也可以选择把 ffmpeg 安装到系统 PATH（此时不依赖本目录的 sidecar）。 
