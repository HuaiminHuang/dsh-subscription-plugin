# 兼容性基线

模型接入阶段以本机 `~/deepseek-harness` 的下列版本作为唯一开发和验收基线。

| 项目 | 锁定值 |
| --- | --- |
| DSH 提交 | `477b4f420553e8a52c2fbccc464d7561b239c443` |
| DSH 版本 | `0.1.7-rc.2` |
| DSH 标签描述 | `dsh-v0.1.7-rc.2` |
| Node.js | `26.8.2` |
| pnpm | `11.7.0` |
| pi-ai | `@earendil-works/pi-ai` `0.85.1`，使用 DSH 锁文件中补丁哈希 `b9bcce474fb2ac44633dff0fa722816a5bff5451b4575d5874035ea14ba70a4f` |

此 pi-ai 版本内置 `openai-codex` OAuth provider 和 Codex Responses 协议。插件应通过自己的凭据记录和路由使用该能力，不能占用 `llm-pi-ai/openai-codex` 记录或 DSH 官方 `openai-codex` 路由。

## 本机检出状态

记录时该 DSH 工作树含两处未提交的 Desktop 构建相关修改：`apps/desktop/scripts/desktop-build-paths.mjs` 和 `tsconfig.desktop-keyboard-tests.json`。它们不在已核查的 Host、Client、凭据、授权或 LLM 接口路径中，但该工作树不是可复现的干净发行基线。

模型接入的真实 Web/Loader 测试可先以此检出执行。发布包和 Desktop 验收前，必须改用同一提交的干净检出，或将经过审查的差异另行固定并重新记录结果。
