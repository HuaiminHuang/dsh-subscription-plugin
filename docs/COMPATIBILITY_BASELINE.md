# 兼容性基线

## 当前源码：多版本兼容更新（未发布）

2026-11-10 核对官方 npm registry：`@deepseek-ai/dsh` 的 `latest` / `next` 均为 `0.2.2-rc.1`，发布于 2026-11-04。开发依赖固定到该版本，不使用各子包可能滞后的 `latest` 标签。对应 GitHub 标签 `dsh-v0.2.2-rc.1` 提交为 `66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db`。

明确的兼容目标如下，未核查版本不自动纳入 peer 范围：

| DSH | 目标含义 |
| --- | --- |
| `0.2.2-rc.1` | 最新发布 |
| `0.2.2-alpha.3` | 前一次发布 |
| `0.2.1-rc.5` | 前两次发布，也是前一个版本系列 |
| `0.2.0-rc.2` | 原插件基线，也是前两个版本系列 |

所有 DSH peer 使用上述精确版本的并集，避免宽泛 semver 范围遗漏预发布版本或误接纳未知 API。最新开发环境需要 Node.js >=24.9.0；本次本地检查使用 Node.js 26.8.2、pnpm 11.7.0。旧宿主仍遵循其各自的 Node 要求。

### 兼容方式

- 最新 DSH 在模型选择器注入类型中新增 `resolveText`。插件自己的面板只依赖 `available`、`directory`、`load`、`select` 这组共同契约，不强制旧版提供新字段。
- 最新 Gateway/Typert Client 导出区分 Node 与浏览器。测试显式选择浏览器 factory；插件仍使用四个目标版本共同支持的 ModuleLoader factory。
- 最新 SessionController 不再公开 `buildModelCatalog` 辅助导出。回归测试改走公开的 `modelCatalog()` 方法。
- DSH 的 pi-ai 从 `^0.87.1` 经 `^1.1.0` 升为 `^1.3.0`。插件不再将 `0.87.1` 强加为宿主 peer，改为拥有固定依赖并把补丁后的实现打包进 Host。OAuth 使用 pi-ai 的公共静态加载注册器，避免打包后懒加载路径缺失。声明文件仍可引用固定依赖的类型；不会替换官方提供商或读取其凭据。
- `0.2.2-alpha.3` 依赖 Cordis `~4.0.6-alpha.2` 与 Schemastery `~3.18.6-alpha.2`。peer 范围明确包含这些预发布版本，不用 `--force` 或 `--legacy-peer-deps` 绕过检查。
- Codex Responses 不再接收宿主通用 `temperature` 选项，避免 `Unsupported parameter: temperature`。回归测试通过实际 pi-ai 序列化器和进程内模拟响应覆盖普通/预备请求；图片 generations/edits 请求继续保持固定参数及参考图，不自动重试付费调用。此测试不等于真实账号生成验收。
- 现有凭据键、路由、Remote namespace、独立组件开关不变。兼容测试不读真实账号、不启动或停止用户 Web 服务，也不改 `~/.dsh`。

### 可重复验证

运行 `pnpm typecheck`、`pnpm test`、`pnpm test:package`、`npm pack --dry-run` 和 `git diff --check`。再运行 `pnpm test:compatibility`，它只构建一次、只打包一次，在四个独立临时目录安装同一个 tarball 和对应版本的官方 DSH 运行时。

每个矩阵项核对实际安装版本，通过真实 profile 解析、兼容性预检、Loader、ToolRuntime、SkillRegistry，验证订阅路由、生图工具与 Skill、紧凑面板独立开关及完整卸载；随后对安装后的同一产物运行 Host/Client/Remote 注册与撤销、模拟 UI 和 OAuth 模块加载检查。OAuth 在选择登录方式之前取消，不打开回调端口、不调用真实授权端点。

这些检查使用合成凭据与模拟网络/存储，证明包安装、共同 API 与生命周期组合，不代表真实登录、令牌刷新、模型/生图请求、完整浏览器服务器或 Desktop 验收。本次为源码兼容更新，不代表 npm 新版本已发布；已发布 `0.1.3` 的记录不变。

来源：[npm DSH registry](https://registry.npmjs.org/@deepseek-ai%2Fdsh)、[最新上游提交](https://github.com/deepseek-ai/deepseek-harness/tree/66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db)。

## 历史：0.1.1–0.1.3 单版本基线

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
