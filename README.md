# DSH OpenAI Subscription

一个计划中的独立 DeepSeek Harness 插件：在现有设置窗口中登录 ChatGPT/Codex、查看订阅额度，并通过 DSH `LlmAdapter` 选择和使用 Codex 模型。

**状态：规划中。** 仓库尚无可安装插件、OAuth 实现或真实账号验证；此时安装本目录不会为 DSH 增加功能。

## 方向

- 作为单独安装、默认不启用的 Bundle 交付；不修改 DSH 官方插件，也不注册或覆盖 `llm-pi-ai` 的 `openai-codex` 路由。
- 由插件自己的 Host、Remote 和 Client 组成；Client 通过 `settings.section` 在 DSH 原有设置窗口新增 OpenAI / Codex 页面。Web 与官方 Desktop 共用页面，但分别安装到其各自的 profile。
- 优先复用 pi-ai 的 Codex 授权与模型请求实现，同时使用 DSH 的授权、凭据和 `LlmAdapter` 接口；不读取、复制或刷新 Codex CLI 的私有登录文件。
- 订阅额度与每次模型调用的 token 用量分开处理。窗口、套餐和重置时间以服务端返回为准；额度接口不可用时，不影响已登录的模型请求。

## 下一步

[实施计划](docs/IMPLEMENTATION_PLAN.md)列出架构选择、登录与模型调用流程、额度来源的待验证点、分阶段交付及验收标准。在完成其中的验证关口之前，不承诺单次授权可同时驱动模型请求、额度读取和 reset 卡操作。

开发时先读 [AGENTS.md](AGENTS.md)；与设置页、异步测试和演示录制有关的上游技能副本集中在 [`.agents/`](.agents/README.md)。这些是开发参考，不能代替对目标 DSH 版本的实测。

## 参考

- [DSH `LlmAdapter` 与模型目录](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm/src/index.ts)
- [DSH 设置页面扩展位](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-settings/src/client/contract/slots.ts)
- [Codex App Server 账户与额度接口](https://developers.openai.com/codex/app-server#authentication-and-account-apis)
- [V1ki/dsh-plugin-subscriptions](https://github.com/V1ki/dsh-plugin-subscriptions)：独立设置页和订阅额度展示的生态参考；本项目不复制其多提供商、账户池和附加工具范围。

本仓库是独立社区项目，不代表 DeepSeek 或 OpenAI 的官方插件或背书。
