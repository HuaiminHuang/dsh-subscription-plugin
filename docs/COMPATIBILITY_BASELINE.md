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

v0.1.0 发行核对时，本机 DSH HEAD 仍为表中固定提交，工作树有五个未提交的 Desktop 构建相关文件：

- `apps/desktop/scripts/desktop-build-paths.d.mts`
- `apps/desktop/scripts/desktop-build-paths.mjs`
- `apps/desktop/scripts/development-project.ts`
- `apps/desktop/tests/desktop-build-paths.spec.ts`
- `tsconfig.desktop-keyboard-tests.json`

这些差异不在本版核查的 Host、Loader、Client、附件、凭据、授权或 LLM 接口路径中；不重置用户工作，也不据此声明 Desktop 支持。v0.1.0 的插件产物从独立源码快照全新构建，复用固定参考 DSH 的已构建 Web/Host 依赖；不是 DSH 全仓重新构建的证明。该 tarball 在临时 Web profile 安装后，通过实际 profile 模块解析、Loader、ToolRuntime 与 SkillRegistry 完成挂载和卸载验证，认证/网络/存储使用合成依赖。完整 Desktop 验收仍需同一提交的干净检出与平台实测。
