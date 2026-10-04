# 歌词性能诊断

用于观察歌词换行、逐字动画和滚动时的长帧，并比较同一曲目、同一片段优化前后的结果。脚本通过 Chrome DevTools Protocol（CDP）连接开发模式的 WebView2。

## 环境与准备

- Windows、PowerShell、Node.js，以及可运行 `pnpm dev` 的项目环境。
- 从仓库根目录执行以下命令。开发服务器默认端口为 5173，CDP 默认端口为 9222；脚本只连接匹配开发服务器地址的页面。
- 启动前设置 WebView2 调试参数：

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'
pnpm dev
```

另开一个终端执行采集命令。先在应用内选择有歌词的歌曲，打开正在播放页面并选择动画歌词模式。`-TrackTitle` 必须与音乐库中的歌曲标题匹配；省略时使用当前曲目。

采集会打开动画歌词模式，可能跳转或恢复播放，并临时注入样式及诊断回调。正常完成时会清理注入内容，但不恢复曲目、播放位置及歌词模式；中断或异常后建议关闭并重新启动开发应用，再开始下一次采集。结束后可用 `Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 清除当前终端的调试参数。

## 工具

| 文件 | 用途 |
|---|---|
| `profile-lyrics.ps1` | 采集帧间隔、换行边界、DOM 变化和歌词调试事件；`-LowOverhead` 减少采样本身的干扰 |
| `trace-lyrics.ps1` | 采集浏览器 trace，用于区分脚本、布局、绘制等开销；同时输出 `.meta.json` |
| `analyze-lyrics-profile.mjs` | 离线分析一个或多个采样/trace 文件；`--compact` 输出精简摘要 |
| `run-lyrics-baseline.ps1` | 对明确指定的曲目重复采样并统一分析 |
| `test-lyrics-performance.ps1` | 检查采样是否包含换行，以及换行附近最差帧是否超过指定阈值 |

各 PowerShell 脚本的参数可用 `Get-Help <脚本路径> -Full` 查看。采样和 trace 中的样式覆盖开关用于定位原因，可能依赖某一版本的 DOM/CSS；无覆盖开关的采样才适合作为性能基线。

## 采样与分析

```powershell
# 先测正常表现，再用较详细的采样定位问题。
./scripts/diagnostics/profile-lyrics.ps1 -DurationMs 30000 -StartSeconds 35 -LowOverhead -OutputPath logs/diagnostics/before.json
./scripts/diagnostics/profile-lyrics.ps1 -DurationMs 30000 -StartSeconds 35 -OutputPath logs/diagnostics/detail.json
node scripts/diagnostics/analyze-lyrics-profile.mjs logs/diagnostics/before.json logs/diagnostics/detail.json --compact

# 优化后使用相同歌曲、片段、采样时长和模式重复采样。
./scripts/diagnostics/profile-lyrics.ps1 -DurationMs 30000 -StartSeconds 35 -LowOverhead -OutputPath logs/diagnostics/after.json
node scripts/diagnostics/analyze-lyrics-profile.mjs logs/diagnostics/before.json logs/diagnostics/after.json --compact

./scripts/diagnostics/trace-lyrics.ps1 -DurationMs 12000 -StartSeconds 35 -OutputPath logs/diagnostics/trace.json
node scripts/diagnostics/analyze-lyrics-profile.mjs logs/diagnostics/trace.json --compact
```

如使用其他端口，在 PowerShell 采集命令中传入 `-CdpPort` 和 `-DevServerPort`。trace 文件也可在浏览器性能分析工具中打开。

## 基线与阈值检查

```powershell
./scripts/diagnostics/run-lyrics-baseline.ps1 -TrackTitle '音乐库中的歌曲标题' -Runs 3 -DurationMs 30000 -LowOverhead
./scripts/diagnostics/test-lyrics-performance.ps1 -DurationMs 30000 -StartSeconds 35 -MaxBoundaryFrameMs 16.67
```

基线脚本必须显式指定曲目，默认每次采集 10 分钟；上面的示例将其缩短至 30 秒。性能检查默认以 16.67ms 为换行附近最差帧阈值，可根据刷新率和机器环境调整。没有捕获换行也会失败，需要换片段或增加采集时间。该检查依赖运行中的应用、媒体库和实际硬件，不属于无需环境准备的单元测试。

帧间隔受刷新率、开发构建、后台负载及采样开销影响；它可以提示卡顿，但不能单独证明用户看到了多少掉帧。比较时保持窗口尺寸、歌词模式、曲目片段和采集选项一致。详细采样与低开销采样的数字不宜直接当作优化前后结果比较。

报告默认写入已忽略的 `logs/diagnostics/`，不随源码提交。报告可能包含本地媒体路径和歌词文本，分享前请检查内容。
