# 兼容性基线

模型接入阶段以本机 `~/deepseek-harness` 的下列版本作为唯一开发和验收基线。

| 项目 | 锁定值 |
| --- | --- |
| DSH 提交 | `639ed015397290b3745d163aafe02ffee4aa3f84` |
| DSH 版本 | `0.2.0-rc.2` |
| DSH 标签描述 | `dsh-v0.2.0-rc.2` |
| Node.js | `26.8.2` |
| pnpm | `11.7.0` |
| pi-ai | `@earendil-works/pi-ai` `0.87.1`，使用 DSH 锁文件中补丁哈希 `b9bcce474fb2ac44633dff0fa722816a5bff5451b4575d5874035ea14ba70a4f` |

此 pi-ai 版本内置 `openai-codex` OAuth provider 和 Codex Responses 协议。插件应通过自己的凭据记录和路由使用该能力，不能占用 `llm-pi-ai/openai-codex` 记录或 DSH 官方 `openai-codex` 路由。

## 0.1.1 兼容性迁移

本次对齐 DSH `0.2.0-rc.2`，不声明尚未核查的 `0.2.0` 正式版或后续版本兼容。插件版本更新为 `0.1.1`，所有 DSH peer 精确锁定到此候选版；pi-ai peer 更新到 `0.87.1`。开发依赖现使用 npm 固定版本，不依赖本地 link。pi-ai 的同一补丁随源码保存于 `patches/pi-ai-0.87.1.patch`，由 `pnpm-workspace.yaml` 应用；补丁哈希保持表中锁定值。

与旧基线相比，授权、凭据、LLM、Typert 及设置槽位核心源码未变。模型选择与会话 UI 有新增行为，插件依赖的 `ModelSelectInjected` 槽位契约未变。检查范围包括新版依赖下的类型检查、单元测试、构建包预检和 Host/Client 注册撤销；新版独立源码快照构建的 tarball 另经隔离 Web profile 的 DSH CLI 安装及实际 Loader/ToolRuntime/SkillRegistry 挂载、独立开关和卸载检查，使用合成认证与模拟网络/存储。Desktop、真实账号登录/刷新/调用和完整浏览器组合仍未验证，Client 平台声明继续为 Web。

本次参考检出仍有四个 Desktop 构建相关未提交文件（下述清单前四项），未改动或重置。

## 历史发行验证（0.1.0）

v0.1.0 发行核对时，本机 DSH HEAD 为旧基线 `477b4f420553e8a52c2fbccc464d7561b239c443`（DSH `0.1.7-rc.2`），工作树有五个未提交的 Desktop 构建相关文件：

- `apps/desktop/scripts/desktop-build-paths.d.mts`
- `apps/desktop/scripts/desktop-build-paths.mjs`
- `apps/desktop/scripts/development-project.ts`
- `apps/desktop/tests/desktop-build-paths.spec.ts`
- `tsconfig.desktop-keyboard-tests.json`

这些差异不在本版核查的 Host、Loader、Client、附件、凭据、授权或 LLM 接口路径中；不重置用户工作，也不据此声明 Desktop 支持。v0.1.0 的插件产物从独立源码快照全新构建，复用固定参考 DSH 的已构建 Web/Host 依赖；不是 DSH 全仓重新构建的证明。该 tarball 在临时 Web profile 安装后，通过实际 profile 模块解析、Loader、ToolRuntime 与 SkillRegistry 完成挂载和卸载验证，认证/网络/存储使用合成依赖。完整 Desktop 验收仍需同一提交的干净检出与平台实测。
