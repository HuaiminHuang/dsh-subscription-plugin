# @h2mzzz/dsh-openai-subscription

独立、可选的 DeepSeek Harness (DSH) Bundle：在 DSH 设置窗口增加 **OpenAI** 页面，使用 ChatGPT/Codex 订阅登录，并通过插件自己的模型路由调用 Codex。**社区项目，非 DeepSeek 或 OpenAI 官方插件。**

**当前状态：开发中，尚未发布 npm 包，也未用真实账号完成授权、模型调用或额度验证。** 包版本为 `0.0.0` 且标记为 `private`；下述安装方法用于本地构建的包，不是可直接从 npm 仓库下载的发行版。

## 兼容性与安装

- 仅按 [兼容性基线](docs/COMPATIBILITY_BASELINE.md)中的 DSH `0.1.7-rc.2`（提交 `477b4f420553e8a52c2fbccc464d7561b239c443`）、Node 与已打补丁的 `@earendil-works/pi-ai@0.85.1` 开发。需要一个能运行 `dsh` 和 `pnpm` 的 DSH 安装；其他版本没有验证，不建议使用版本豁免强行启用。
- 本地构建需要与仓库同级的 `../deepseek-harness` 检出，以满足 `package.json` 中的开发依赖链接。这些源码链接**不是**安装到用户 profile 的方式。
- 当前只建议在 **Web profile** 安装和验证；官方 Desktop 的独立 profile、窗口和系统浏览器授权尚未实测，Headless/TUI 不是此设置页的支持范围。

在插件仓库根目录构建并打包：

```sh
pnpm install --ignore-scripts
pnpm typecheck
pnpm test
pnpm test:package
npm pack --pack-destination /tmp/opencode
```

然后通过 DSH 的 profile 插件命令安装刚生成的 tarball（先核对实际文件名；当前版本的文件名如下）：

```sh
dsh plugin --profile web add /tmp/opencode/h2mzzz-dsh-openai-subscription-0.0.0.tgz
```

DSH 会根据包内 `dsh.bundle.patch` / `cordis.patch.yml` 把 Host 和 Client 入口加入该 profile；它不是直接启动的 Node 应用。**安装或更新 Bundle 后，由你自行重启 Web profile 并刷新页面**，再在设置窗口的 OpenAI 页面登录；不要把服务端的回调 URL、授权码、令牌或整个授权错误页发给其他人。浏览器登录只适合浏览器与 DSH Host 在同一台机器的情形；设备代码方式存在于依赖实现中，但服务端是否对账号开放仍待实测。

已安装旧的无 scope 包 `dsh-openai-subscription` 时，先在**停用该 profile 的维护窗口**执行 `dsh plugin --profile web remove dsh-openai-subscription`，再添加上述新包并由你自行重启。不要让新旧包同时加载：它们共享路由与凭据键。改名**不会**迁移或删除已有插件凭据；但真实的跨包升级、重启恢复仍待验证。本文不要求自动退出登录，也不修改你正在运行的 Web 服务。

### 默认模型

插件提供模型路由 `codex-subscription`，不全局修改 DSH 的 `agent-default-model`。若希望该 Web profile 的新会话默认使用 `gpt-5.6-terra`、Medium 思考强度，可在该 profile 的 `cordis.patch.yml` 里为**现有** `agent-default-model` 条目设置（与其他条目合并，不要替换整个文件）：

```yml
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: codex-subscription
    model: gpt-5.6-terra
    reasoningEffort: medium
```

本机 Web profile 已使用这三个值；包本身不会覆盖其他用户的 profile 或已有会话的模型选择。模型必须在登录后出现在目录中才可选；是否有服务端使用权限仍以真实请求为准。插件对其当前支持 Medium 的 Codex 型号也报告 Medium 为**思考强度默认值**，明确选择其他强度时以选择值为准。

## 功能与边界

- **独立身份：** npm 包名是 `@h2mzzz/dsh-openai-subscription`（npm 不接受含大写字母的 `@H2MZZZ` 作为新包 scope）；展示名是 OpenAI，但 DSH 路由 ID 仍为 `codex-subscription`，不会占用官方的 `openai` / `openai-codex` 路由。凭据作用域仍为 `dsh-openai-subscription`、记录 ID 为 `codex`，改名不改变已有记录或其他插件的凭据。
- **授权：** 设置页的「登录」展开浏览器登录和设备代码登录；Host 持有 OAuth state、授权回调、令牌、轮换与凭据写入。浏览器点击时打开新标签；loopback 页面显示“完成”只表示回调已收到，**不**证明凭据已经保存或模型可用。登录状态由 Host 自动同步；取消与退出仅作用于本插件的授权尝试/凭据。设备代码以及远程浏览器后备流程尚未用真实账号验证，不保证可用。
- **模型：** 列表是锁定的 pi-ai `openai-codex` **静态目录**，并非实时抓取账号的可用型号。当前目录有 `gpt-5.6-terra`、`gpt-5.6-sol`、`gpt-5.6-luna`、`gpt-6-astra` 等；**没有** `gpt-6-sol` 和 `gpt-6-luna`。目前只能确定依赖目录缺少它们，不能断言是因为“太新”或账号权限，也不会凭空添加未核实的型号。
- **思考强度：** 通过 DSH 原有模型选择器显示各型号实际可发送的 Low、Medium、High、Extra high，明确支持时再显示 Max。当前目录的 Minimal 映射到 Low，故不重复提供；“关闭”仅省略参数，不能保证关闭服务端默认，因此不展示。不支持的档位直接拒绝而不静默改档。此处仅有模拟请求验证，真实响应尚未确认。
- **请求范围：** 首版支持文本和常规工具调用；图像、deferred tools 与 stop sequences 不提供有效支持，不应假设它们可用。插件不以 `OPENAI_API_KEY` 或其他插件/Codex CLI 的登录做后备。
- **额度：** 订阅窗口、重置时间和 reset 卡尚未实现；一次请求的 token 用量**不是**订阅额度。没有服务端数值就不能显示为零，也没有消耗 reset 卡的功能。
- **停用与退出：** 移除 Bundle 不等于退出登录；设置页「退出登录」才会删除本插件自己的记录。不要把凭据、完整 callback URL 或真实授权响应写入仓库、日志、截图或问题报告。

## 开发与验证状态

`pnpm typecheck`、`pnpm test`、`pnpm test:package` 包括 Host/Client 类型检查、模拟授权/适配器测试及构建后的 Client 激活检查；**这些检查不能替代**真实 Loader/profile 组合、真实授权/模型调用、Desktop 测试或额度接口验证。更详细的实施和验收边界见[实施计划](docs/IMPLEMENTATION_PLAN.md)。

开发时先读 [AGENTS.md](AGENTS.md)。本仓库的 `.agents/` 仅提供开发参考。更多接口背景：[DSH 插件管理说明](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/apps/cli/reference/README.zh.md)、[DSH 设置槽位](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/packages/client/ui-settings/src/client/contract/slots.ts)、[Codex App Server 账户接口](https://developers.openai.com/codex/app-server#authentication-and-account-apis)。
