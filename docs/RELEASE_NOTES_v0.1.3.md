# v0.1.3

本版将插件发布到公开 npm registry；npm latest 为 0.1.3，GitHub Release 已同步同版本。运行时功能与 0.1.2 相同，目标仍为 DSH 0.2.0-rc.2 及其 pi-ai 0.87.1 补丁版，验证范围保持 Ubuntu/Web。

## 安装与发行

在 DSH 添加插件中输入 `@h2mzzz/dsh-openai-subscription`，或用 `@h2mzzz/dsh-openai-subscription@0.1.3` 固定版本。npm 包包含预构建产物，无需本插件的 Git prepare 构建许可。GitHub 源码安装仍通过 prepare 构建，仍受目标 profile 的 allowBuilds 策略约束。

移除 private 发布限制，指定公开 registry，补充 repository 元数据。GitHub Release 附件直接下载自 npm，提供 SHA256SUMS。README npm 徽章链接至公开包页面；GitHub Packages 不是 npmjs 的镜像。

## 验证

- 独立源码快照：类型检查、143 项测试、构建包检查、pack dry-run 通过。
- 无本插件构建许可的隔离 profile：tarball 与 npm registry 安装均通过。
- 实际 DSH Loader、ToolRuntime、SkillRegistry：挂载、独立组件开关、工具/Skill/路由撤销与卸载通过；认证和网络采用合成依赖。
- Ubuntu、Windows、macOS 的 PR CI 通过，不代表 Desktop GUI 支持验收。

未新增登录、刷新、模型调用或 Desktop 的真实账号端到端验收。此前额度的真实 API 与 Web UI 验证见 [v0.1.2](RELEASE_NOTES_v0.1.2.md)。reset 卡仍未交付。

发行自动化的后续工作流见 [发布指南](RELEASING.md)：源码包含稳定 Release 同步流程，但 npm trusted publisher 配置和实际 OIDC 发布尚未确认，不宣称自动发行已完成验收。
