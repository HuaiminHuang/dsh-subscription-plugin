# v0.0.2 — 开发预发布版（Ubuntu 验证范围）

独立、可选的 `@h2mzzz/dsh-openai-subscription` DSH Bundle。**不是稳定版，也没有发布到 npm。** GitHub Release 的构建后 `.tgz` 是安装附件；GitHub 自动生成的 Source ZIP/TAR 不是插件包。

## 兼容性与已验证内容

- 目标 DSH `0.1.7-rc.2` / 提交 `477b4f420553e8a52c2fbccc464d7561b239c443`，已打补丁的 `@earendil-works/pi-ai@0.85.1`。不声明其他版本兼容。
- Ubuntu / Node `26.8.2` / pnpm `11.7.0`：类型检查、模拟测试、构建包激活和 tarball 文件清单检查。
- 在该提交的**独立干净检出**与隔离 Web profile 中安装构建后的 tarball，验证 Loader 挂载 Host、Remote 服务可见、禁用 HMR 后卸载 Loader 行时 Remote 消失且模型路由未遗留。构建包 Client 测试另外验证了设置槽位挂载和撤销；这些测试**没有**验证浏览器 UI 的真实 profile 组合。
- 用确定性的延迟 Promise 测试覆盖登录状态刷新与退出、授权未收尾与退出、模型请求与退出、卸载时迟到状态，以及 Client 操作失败的安全提示。

隔离 profile 的 pnpm 安装会对 DSH 核心 peer 依赖报告“missing peer”警告，因为内置核心包属于 DSH 安装而非该 profile 的 pnpm 清单；Host Loader 装载/卸载实测通过。此结果不证明其他安装或 Desktop 组合可用。

## 尚未验证或提供

- 未使用真实 ChatGPT 账号验证授权成功、令牌刷新、模型文本/工具调用与取消；设备代码和远程浏览器后备也未验证。Loopback 回调页面并非持久登录证明。
- 未在真正的浏览器中完成 Web 窄窗口、深浅色、焦点及断线重连验收。Desktop 安装、系统浏览器回调与窗口适配未测试；Web profile 已安装不代表 Desktop 自动安装。
- 未实现订阅额度、重置时间或 reset 卡。静态模型目录不代表服务端已授予账号该模型的调用权限。

旧无 scope 包 `dsh-openai-subscription` 与本包不能在**同一 profile** 中同时启用。不得复制凭据文件或把授权码、回调 URL、token、真实服务端响应提交到仓库或诊断中。
