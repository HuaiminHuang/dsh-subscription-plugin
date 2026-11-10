# v0.1.4

本版更新 DSH 多版本兼容，并修复 Codex Responses 拒绝通用 `temperature` 参数导致的请求失败。包名仍为 `@h2mzzz/dsh-openai-subscription`，现有账号存储键、路由与组件开关保持不变。

## 兼容性与修复

- 最新目标：DSH `0.2.2-rc.1`。同时验证 `0.2.2-alpha.3`、`0.2.1-rc.5`、`0.2.0-rc.2`，覆盖前两次发布及前两个版本系列。
- 独立打包插件自己的 patched pi-ai `0.87.1`，不强制宿主降级 pi-ai；修复打包后 OAuth 懒加载路径，保留旧版共同 API。
- Codex 请求不再发送 `temperature`。回归测试通过真实 pi-ai 序列化器重现服务端参数拒绝，验证普通与预备请求；图片 generations/edits 参数与参考图保持不变，不自动重试付费调用。
- 安装包附带第三方许可证说明。CI 增加四版本隔离安装与实际 DSH Loader 生命周期验证，稳定 tag 可触发 npm OIDC 发行流程。

## 安装

在 DSH 添加插件中输入 `@h2mzzz/dsh-openai-subscription@0.1.4`。npm 包包含预构建产物，无需插件 Git prepare 构建许可。Git 来源 `github:HuaiminHuang/dsh-subscription-plugin#v0.1.4` 仍需消费者按提示许可源码构建。

## 验证与边界

- 类型检查、148 项测试、构建包 smoke、npm pack 检查通过。
- 同一 tarball 在四个精确 DSH 版本分别安装，真实 profile 解析、Loader、ToolRuntime、SkillRegistry 挂载、独立开关及卸载通过。
- 包内 OAuth 模块加载、合成流式文本/工具/用量与取消、Host/Client/Remote 注册撤销及模拟 UI 检查通过。
- Ubuntu、Windows、macOS 的代码与包 CI 通过，不代表 Desktop GUI 支持验收。

本次使用合成凭据及模拟网络，没有真实账号登录、令牌刷新、模型/图片生成或 Desktop 端到端验收。`temperature` 错误在回归测试中复现并修复，不声称已确认用户此前失败请求的完整历史路径。当前 npm / GitHub 发行结果以 registry、Release 及 Actions 记录为准。
