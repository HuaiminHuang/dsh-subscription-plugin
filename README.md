# DSH OpenAI Subscription

一个独立、默认不启用的 DeepSeek Harness Bundle：在现有设置窗口中登录 ChatGPT/Codex，并通过 DSH `LlmAdapter` 选择和使用 Codex 模型。

**状态：阶段 1 开发中，尚未完成真实账号或发行验证。** 已实现 Host、Client、独立凭据记录、独立模型路由和 pi-ai Codex OAuth 桥接；尚未实现额度读取或 reset 卡，也未声称已通过真实 ChatGPT 登录。

## 方向

- 作为单独安装、默认不启用的 Bundle 交付；不修改 DSH 官方插件，也不注册或覆盖 `llm-pi-ai` 的 `openai-codex` 路由。对外路由为 `codex-subscription`，凭据记录仅属于 `dsh-openai-subscription/codex`。
- 由插件自己的 Host、Remote 和 Client 组成；Client 通过 `settings.section` 在 DSH 原有设置窗口新增 OpenAI / Codex 页面。Web 与官方 Desktop 共用页面，但分别安装到其各自的 profile。
- 优先复用 pi-ai 的 Codex 授权与模型请求实现，同时使用 DSH 的授权、凭据和 `LlmAdapter` 接口；不读取、复制或刷新 Codex CLI 的私有登录文件。access token、refresh token、授权码和 loopback 回调 URL 均不经 Client Remote。
- 启动时的预备登录检测只进行不破坏性的 pi-ai 模型可用性检查；失败不会删除原有凭据。已登录才注册模型路由，登出或不可用检查会撤销它。
- 订阅额度与每次模型调用的 token 用量分开处理。窗口、套餐和重置时间以服务端返回为准；额度接口尚未验证或实现。

## 本地开发检查

本仓库的开发依赖指向同级的 `../deepseek-harness` 检出，且仅适配[兼容性基线](docs/COMPATIBILITY_BASELINE.md)记录的版本。`@earendil-works/pi-ai` 是锁定版本的 peer，运行时由 DSH 的已验证安装提供，避免外部 Bundle 另装一个不兼容的 pi-ai 副本：

```bash
pnpm install --ignore-scripts
pnpm typecheck
pnpm test
pnpm build
npm pack --dry-run
```

构建产物包含 DSH Client 的 `__ModuleLoader__` factory 与外部包自有的 Typert Host/Remote 清单。使用 `npm pack` 得到的包可用于后续 DSH profile/Plugins 安装测试；在进行该测试前应先使用与基线相同提交的**干净** DSH 检出。

## 当前限制

- 首版仅处理文本和普通工具调用；图像、deferred tools、stop sequences 与 reasoning-effort 控制会明确拒绝，避免静默降级。
- 浏览器 OAuth 使用 Host 本机 loopback。pi-ai 的手动回填输入不会显示在插件页面，因此不会要求用户把授权码或完整 callback URL 发送给 Client；device-code 线路仍需真实环境验证。
- 真实授权、刷新、模型调用、工具调用续轮、取消、Web/Desktop profile 组合及额度来源均待用户在本机账户上授权后验证。请勿向聊天、日志、仓库或截图提供任何登录材料。

[实施计划](docs/IMPLEMENTATION_PLAN.md)列出完整的架构选择、额度来源待验证点和阶段验收标准。在完成验证关口前，不承诺单次授权可同时驱动模型请求、额度读取和 reset 卡操作。

开发时先读 [AGENTS.md](AGENTS.md)；与设置页、异步测试和演示录制有关的上游技能副本集中在 [`.agents/`](.agents/README.md)。这些是开发参考，不能代替对目标 DSH 版本的实测。

## 参考

- [DSH `LlmAdapter` 与模型目录](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm/src/index.ts)
- [DSH 设置页面扩展位](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-settings/src/client/contract/slots.ts)
- [Codex App Server 账户与额度接口](https://developers.openai.com/codex/app-server#authentication-and-account-apis)
- [V1ki/dsh-plugin-subscriptions](https://github.com/V1ki/dsh-plugin-subscriptions)：独立设置页和订阅额度展示的生态参考；本项目不复制其多提供商、账户池和附加工具范围。

本仓库是独立社区项目，不代表 DeepSeek 或 OpenAI 的官方插件或背书。
