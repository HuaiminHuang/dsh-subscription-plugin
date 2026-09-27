---
description: "独立的 DSH ChatGPT/Codex 订阅登录与模型接入 Bundle。"
kind: "package-bundle"
---

# @h2mzzz/dsh-openai-subscription

简体中文 | [English](README.en.md)

独立、可选的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件：在原有设置窗口增加 **OpenAI** 页面，通过插件专有的 `codex-subscription` 模型路由调用 Codex。它不是 DeepSeek 或 OpenAI 的官方插件。

> **开发中。** 目前在 Ubuntu 上完成类型检查、模拟测试、构建包检查和隔离 Web profile 的 Host 装载/卸载检查；真实 ChatGPT 授权与模型请求、浏览器端完整 UI 组合及 Desktop 客户端均未完成验收。包为 `0.0.2` / `private`，仅作为 GitHub Pre-release 附件提供，尚未发布 npm 包。

## 兼容性

| 项目 | 当前范围 |
| --- | --- |
| DSH | `0.1.7-rc.2`，提交 `477b4f420553e8a52c2fbccc464d7561b239c443` |
| pi-ai | DSH 使用的已打补丁 `@earendil-works/pi-ai@0.85.1` |
| Web profile | 隔离 profile 中的 Host 装载/卸载与构建后 Client 槽位测试；真实授权、模型调用待验证 |
| Desktop | 复用同一 Web 界面，但需要独立安装到 Desktop profile；尚未实测 |

其他 DSH 版本和平台未验证，不建议使用版本豁免绕过兼容性检查。精确依赖和本机检出条件见[兼容性基线](https://github.com/HuaiminHuang/dsh-subscription-plugin/blob/main/docs/COMPATIBILITY_BASELINE.md)。

## 安装

从 [v0.0.2 Pre-release](https://github.com/HuaiminHuang/dsh-subscription-plugin/releases/tag/v0.0.2) 下载**构建后的 npm `.tgz` 附件**。Web profile 可直接使用该附件 URL：

```sh
dsh plugin --profile web add https://github.com/HuaiminHuang/dsh-subscription-plugin/releases/download/v0.0.2/h2mzzz-dsh-openai-subscription-0.0.2.tgz
```

也可从本仓库自行构建：构建依赖需要同级目录中的目标版本 `../deepseek-harness` 检出。在插件仓库根目录运行：

```sh
pnpm install --ignore-scripts
pnpm test:package
npm pack
```

`npm pack` 会生成 `h2mzzz-dsh-openai-subscription-0.0.2.tgz`。安装到 Web profile（把路径换成产物的实际**绝对路径**）：

```sh
dsh plugin --profile web add /absolute/path/to/h2mzzz-dsh-openai-subscription-0.0.2.tgz
```

在受支持版本的 Desktop 中，使用应用内 **「插件」→「添加插件」** 输入上述 `.tgz` 附件 URL 或 Desktop 电脑可访问的本地 `.tgz` 绝对路径，再按界面提示启用；**不要**运行 `dsh plugin --profile desktop` 或手工修改 Desktop profile。Web 和 Desktop 复用 UI，却各自拥有插件依赖与启用列表，Web 安装不会自动同步过去。Desktop 安装与登录流程尚待实测。仓库源码 ZIP 和 Git 地址没有安装所需的 `lib/`，不能直接当成可用插件包。

旧的无 scope 包 `dsh-openai-subscription` 和新包不能在**同一 profile** 同时启用：它们占用相同的路由和历史凭据键。迁移时应在维护窗口移除旧包、安装新包，并按 DSH 的提示由用户自行重启；停用或移除 Bundle 不会自动注销插件的账户。

## 使用

1. 打开 DSH 设置窗口的 **OpenAI** 页面，点击「登录」，选择浏览器登录或设备代码登录。浏览器登录需要浏览器与 DSH Host 在同一台电脑上；设备代码方式是否被服务端接受尚未用真实账号验证。回调页显示完成不等于令牌已经成功写入，以插件实际状态为准。
2. 登录成功后从 DSH 模型选择器选择 `codex-subscription` 路由下的型号及思考强度。模型列表来自锁定的 pi-ai **静态目录**，列出一个 ID 不代表账号已获服务端调用权限。当前目录含 `gpt-5.6-terra`，不含 `gpt-6-sol`、`gpt-6-luna`。
3. 如需让某个 Web profile 的**新会话**默认使用 `gpt-5.6-terra` / Medium，在该 profile 自己的 `cordis.patch.yml` 中配置现有的 `agent-default-model` 条目；本插件不会覆盖其他 profile 或已有会话的选择：

   ```yml
   - id: agent-default-model
     name: "@deepseek-ai/dsh-agent-default-model"
     config:
       provider: codex-subscription
       model: gpt-5.6-terra
       reasoningEffort: medium
   ```

支持 Medium 的 Codex 型号在插件元数据中也默认 Medium；明确选择其他受支持档位时，以该选择为准。思考档位的映射和透传只有模拟测试证据，尚待真实调用确认。Desktop 的 Electron 窗口会拦截浏览器登录预开的空白标签；授权链接出现后可尝试页面上的「打开登录页面」交给系统浏览器，这条桌面流程也尚未验收。

## Bundle 结构

| 文件 | 职责 |
| --- | --- |
| `package.json`、`cordis.patch.yml` | 声明 `dsh.bundle.patch`、Web Client 入口与单个可选 Loader 行 |
| `src/index.ts`、`src/controller.ts` | Host 插件与授权、凭据状态、模型路由的生命周期 |
| `src/credential-store.ts`、`src/adapter.ts` | 插件专有 OAuth 记录与 DSH `LlmAdapter` 的 Codex 请求转换 |
| `src/typert.host.ts`、`src/remote.ts` | Host/Client 间的插件专有、受校验 Remote 清单 |
| `src/client/` | `settings.section` 页面、中英文 locale 与样式；不持有令牌 |

对外展示名是 OpenAI，但 provider ID 保留为 `codex-subscription`；凭据作用域保留历史值 `dsh-openai-subscription/codex`。这两者都不占用 DSH 官方 `openai` / `openai-codex` 路由，也不读取其他插件或 Codex CLI 的凭据。Host 负责 OAuth 回调、令牌刷新与存储；Client 仅取得显示所需的脱敏状态和授权页面链接。

## 已知限制与延期工作

- 仅声明文本和普通工具调用支持；图像、deferred tools 与 stop sequences 不受支持。模型、取消与工具调用仍缺真实账号验证；登录状态刷新、退出与卸载的竞态只经过确定性的模拟测试，未在真实账号下验证。
- 没有订阅额度、重置时间或 reset 卡功能。一次请求的 token 用量**不是**订阅额度，不能据此推算账户剩余额度。
- Desktop 的安装、窗口适配与系统浏览器授权尚未实测；不要把 Web 的模拟或构建测试视为 Desktop 验收。不同电脑之间不复制 OAuth 凭据文件。
- 不要在仓库、日志、聊天或截图中披露令牌、授权码、完整 OAuth 回调 URL 或真实服务端响应。

## 开发与发布

本仓库定义 `pnpm typecheck`、`pnpm test`、`pnpm test:package`；它们覆盖类型检查、模拟测试和构建后的 Client 激活，但**不替代**真实 Loader/profile 与账号测试。架构及分阶段验收见[实施计划](https://github.com/HuaiminHuang/dsh-subscription-plugin/blob/main/docs/IMPLEMENTATION_PLAN.md)；维护者发布 tarball 的条件与流程见[发布说明](https://github.com/HuaiminHuang/dsh-subscription-plugin/blob/main/docs/RELEASING.md)。修改本项目时还应遵循 [AGENTS.md](https://github.com/HuaiminHuang/dsh-subscription-plugin/blob/main/AGENTS.md)。
