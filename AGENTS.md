# FloatingClock 项目说明

## 定位

Windows 悬浮时钟，服务于限时活动的多平台时间源查看、毫秒显示和倒计时。

## 常用命令

```powershell
npm install
npm test
Set-Location src-tauri; cargo test; Set-Location ..
npm run dev
npm run tauri:build
```

正式打包唯一入口是 `npm run tauri:build`；版本号需同步 `package.json`、`package-lock.json` 根包、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json`。

## 技术与目录

- Tauri 2 + Rust + WebView2；前端在 `src/`，Rust 宿主和打包配置在 `src-tauri/`。
- `test/` 保存 Node 回归测试；`docs/` 保存打包、校时、更新和功能调研。
- `dist/` 是分发文件，`src-tauri/target/` 是构建中间产物，均不提交。

## 约定

- 时间源只使用匿名、只读、可验证的公开端点；失败必须保留既有回退链，不接入 Cookie、账号态或业务下单接口。
- `.tauri` 下的签名私钥和 DPAPI 密码文件在仓库外保管，绝不写入代码、日志或 Git。
- 修改后先运行相关测试；提交、推送、发布和删除操作需要用户明确授权。

## 当前状态

- `v0.1.6` 已发布，公开更新清单为 GitHub Releases 的 `latest.json`。
- 当前时间源顺序：本机、北京、京东、京东秒送、美团、美团闪购、淘宝、淘宝闪购、大麦、拼多多。
- 当前没有未完成的代码改动；后续功能以用户新请求为准。
