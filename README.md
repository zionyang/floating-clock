# 悬浮时钟

面向限时抢购任务的轻量 Windows 悬浮时钟，采用 Tauri + WebView2。

## 功能

- 无边框、始终置顶的悬浮时钟，可从标题栏拖动。
- 固定大小窗口，支持任务栏入口和托盘召回。
- 单实例启动：再次启动时显示已有窗口，不重复创建。
- 使用全局 `Ctrl+Alt+T` 快捷键和托盘菜单快速显示或隐藏窗口。
- 保存窗口位置，并记住上次选择的显示模式和时间源。
- 托盘菜单支持开机启动和鼠标穿透。
- 标题栏菱形按钮控制窗口是否保持在其他窗口上方。
- 支持实时时钟和北京时间倒计时两种模式。
- 倒计时支持下一整点、下一个 `10:00` 和下一个 `20:00` 快捷目标。
- 整点或倒计时目标前最后五秒高亮显示。
- 支持切换北京时间、京东、拼多多和淘宝时间源。
- 时间校准通过 Rust 原生网络请求执行，不受网页跨域限制。
- 每个策略最多采样三次，选择往返时间（RTT）最短的样本计算本机偏移。
- 拼多多和淘宝优先使用毫秒级时间接口，失败后按策略回退到响应头时间。

## 时间源

| 时间源 | 主策略 | 远端回退策略 |
| --- | --- | --- |
| 北京时间 | `https://www.ntsc.ac.cn/` 的 HTTP `Date` 响应头，秒级 | 无其他远端策略 |
| 京东时间 | `https://api.m.jd.com/` 的 HTTP `Date` 响应头，秒级 | 无其他远端策略 |
| 拼多多时间 | `https://api.pinduoduo.com/api/server/_stm` 返回的 JSON `server_time`，毫秒级 | `https://www.pinduoduo.com/` 的 `yak-timeinfo`，毫秒级；再回退到 `Date`，秒级 |
| 淘宝时间 | `https://h5api.m.taobao.com/h5/mtop.common.gettimestamp/1.0/` 返回的 JSON `data.t`，毫秒级 | `https://www.taobao.com/` 的 HTTP `Date` 响应头，秒级 |

所有远端策略都失败时，如果当前时间源已有成功校准的偏移，则保留该偏移；否则暂时使用本机时间。HTTP `Date` 响应头只有秒级精度，且可能受到响应缓存和网络延迟影响。`yak-timeinfo` 虽然位于响应头中，但提供毫秒级时间。界面会显示实际使用的策略、精度和偏移。

最小化窗口或按 `Esc` 时，窗口会隐藏到托盘；关闭按钮、`Alt+F4` 或托盘菜单中的退出选项会退出程序。需要重新显示时，可以使用 `Ctrl+Alt+T`、托盘图标或托盘菜单。若 `Ctrl+Alt+T` 已被其他程序占用，应用仍会正常启动，托盘会标示快捷键不可用，此时可通过托盘图标或菜单操作。

开机启动和鼠标穿透通过托盘菜单控制。开启鼠标穿透后，悬浮层会忽略鼠标输入，关闭托盘菜单中的对应选项后恢复。标题栏菱形按钮控制悬浮层是否保持在其他窗口上方。

## 运行

```powershell
npm install
npm run dev
```

## 测试

```powershell
npm test
```

## Windows 构建

Tauri 构建复用现有渲染器，需要 Rust、Microsoft C++ Build Tools 和 WebView2：

```powershell
npm run tauri:build
```

原始可执行文件和 NSIS 安装程序会写入 `src-tauri/target/release`。NSIS 安装程序使用 Tauri 的 `downloadBootstrapper` 模式：目标电脑缺少 WebView2 时，安装过程需要联网下载运行时。
