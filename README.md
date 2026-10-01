---
description: "独立的 DSH ChatGPT/Codex 订阅登录与模型接入 Bundle。"
kind: "package-bundle"
---

# @h2mzzz/dsh-openai-subscription

简体中文 | [English](README.en.md)

独立、可选的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件：在原有设置窗口增加 **OpenAI** 页面，通过插件专有的 `codex-subscription` 模型路由调用 Codex。它不是 DeepSeek 或 OpenAI 的官方插件。

> **v0.1.0 首个正式版本。** 面向固定 DSH 基线的 Ubuntu / Web 使用，提供独立订阅接入、动态模型目录、模型滑块、快速模式和图片输入桥接。生图与原生识图保留实验能力标记，真实账号识图、Desktop、额度与 reset 卡不属于已验证范围。发行物为构建后的 `.tgz`；保留 `private: true`，不发布到 npm registry。验证范围见 [v0.1.0 发布说明](docs/RELEASE_NOTES_v0.1.0.md)。

## 兼容性

| 项目 | 当前范围 |
| --- | --- |
| DSH | `0.1.7-rc.2`，提交 `477b4f420553e8a52c2fbccc464d7561b239c443` |
| pi-ai | DSH 使用的已打补丁 `@earendil-works/pi-ai@0.85.1` |
| Web profile | 隔离 profile 中的 Host 装载/卸载与构建后 Client 槽位测试；真实授权、模型调用待验证 |
| Desktop | 复用同一 Web 界面，但需要独立安装到 Desktop profile；尚未实测 |

其他 DSH 版本和平台未验证，不建议使用版本豁免绕过兼容性检查。精确依赖和本机检出条件见[兼容性基线](https://github.com/HuaiminHuang/dsh-subscription-plugin/blob/main/docs/COMPATIBILITY_BASELINE.md)。

## 安装

本地保存的发行包可按下方绝对路径命令安装；远端发布后，从 [v0.1.0 Release](https://github.com/HuaiminHuang/dsh-subscription-plugin/releases/tag/v0.1.0) 下载**构建后的 npm `.tgz` 附件**。Web profile 可直接使用该附件 URL：

```sh
dsh plugin --profile web add https://github.com/HuaiminHuang/dsh-subscription-plugin/releases/download/v0.1.0/h2mzzz-dsh-openai-subscription-0.1.0.tgz
```

也可从本仓库自行构建：构建依赖需要同级目录中的目标版本 `../deepseek-harness` 检出。在插件仓库根目录运行：

```sh
pnpm install --ignore-scripts
pnpm test:package
npm pack
```

`npm pack` 会生成 `h2mzzz-dsh-openai-subscription-0.1.0.tgz`。安装到 Web profile（把路径换成产物的实际**绝对路径**）：

```sh
dsh plugin --profile web add /absolute/path/to/h2mzzz-dsh-openai-subscription-0.1.0.tgz
```

在受支持版本的 Desktop 中，使用应用内 **「插件」→「添加插件」** 输入上述 `.tgz` 附件 URL 或 Desktop 电脑可访问的本地 `.tgz` 绝对路径，再按界面提示启用；**不要**运行 `dsh plugin --profile desktop` 或手工修改 Desktop profile。Web 和 Desktop 复用 UI，却各自拥有插件依赖与启用列表，Web 安装不会自动同步过去。Desktop 安装与登录流程尚待实测。仓库源码 ZIP 和 Git 地址没有安装所需的 `lib/`，不能直接当成可用插件包。

旧的无 scope 包 `dsh-openai-subscription` 和新包不能在**同一 profile** 同时启用：它们占用相同的路由和历史凭据键。迁移时应在维护窗口移除旧包、安装新包，并按 DSH 的提示由用户自行重启；停用或移除 Bundle 不会自动注销插件的账户。

## 使用

1. 打开 DSH 设置窗口的 **OpenAI** 页面，点击「登录」，选择浏览器登录或设备代码登录。浏览器登录需要浏览器与 DSH Host 在同一台电脑上；设备代码方式是否被服务端接受尚未用真实账号验证。回调页显示完成不等于令牌已经成功写入，以插件实际状态为准。
2. 登录成功后从 DSH 模型选择器选择 `codex-subscription` 路由下的型号及思考强度。插件会用本次 OAuth 授权向 Codex 后端的 `GET /backend-api/codex/models` 查询**账号当前可见的型号目录**，并以 `visibility: "list"` 与 `supported_in_api` 过滤掉 `gpt-reserve`、`codex-auto-review` 这类内部条目；思考档位也按服务端为每个型号返回的 `supported_reasoning_levels` 收敛。该接口按 `client_version` 参数门控：安装版本 pi-ai 对应的代数只会拿到空列表，因此插件固定发送一个已知能返回完整目录的代数。发现失败或返回空列表时保留当前目录（首次登录时用随包静态目录兜底），不会把模型列表清空，并在下一次登录状态检查时重试；单次发现请求受 15 秒上限约束，且随退出登录或插件卸载一起取消，挂起的接口不会拖住登录检查或卸载。列出某个 ID 仍不代表账号已获服务端调用权限。
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
| `package.json`、`cordis.patch.yml` | 声明 `dsh.bundle.patch`、Web Client 入口与可分别启停的订阅、生图、紧凑模型滑块三个 Loader 条目 |
| `src/index.ts`、`src/controller.ts` | Host 插件与授权、凭据状态、模型路由的生命周期 |
| `src/credential-store.ts`、`src/adapter.ts` | 插件专有 OAuth 记录与 DSH `LlmAdapter` 的 Codex 请求转换 |
| `src/discovery.ts`、`src/codex-auth.ts` | 用插件自身授权查询账号当前型号目录，以及目录与生图请求共用的账号声明读取 |
| `src/typert.host.ts`、`src/remote.ts` | Host/Client 间的插件专有、受校验 Remote 清单 |
| `src/client/` | `settings.section` 页面、中英文 locale 与样式；不持有令牌 |
| `src/imagegen/`、`src/client/imagegen/`、`skills/codex-subscription-imagegen/` | 开发中的可选 Host 生图工具、会话图片卡片和随包 Skill；与文本适配器分离 |

对外展示名是 OpenAI，但 provider ID 保留为 `codex-subscription`；凭据作用域保留历史值 `dsh-openai-subscription/codex`。这两者都不占用 DSH 官方 `openai` / `openai-codex` 路由，也不读取其他插件或 Codex CLI 的凭据。Host 负责 OAuth 回调、令牌刷新与存储；Client 仅取得显示所需的脱敏状态和授权页面链接。

## 已知限制与延期工作

- 模型路由支持文字、普通工具调用，以及模型目录声明 `image` 时的用户图片与工具结果图片输入；通过 Host 的 DSH 附件服务读取并转换为 Codex 原生图片消息，不依赖生图条目是否启用。图片预览采用与 DSH pi-ai 一致的 2048×2048 像素预算、单图 1 MiB 编码目标与整次请求 20 MiB Base64 预算；历史卸载图片保留文字占位，超额返回标准卸载要求。已验证附件转换与实际 pi-ai 协议序列化，真实账号识图尚待验收。deferred tools、system/assistant/developer 中的图片与 stop sequences 不受支持。源码新增的实验性 `codex_generate_image` 是**独立 Host 工具**，随 Bundle 默认启用，通过 DSH 侧栏「插件」→ 本组合包 →「OpenAI 生图工具」开关独立启停，无需手写 `imageGen.enabled`。随包 Skill 与工具仅在生图条目启用且已登录时注册，关闭生图不影响文本登录或模型路由。工具结果给模型的仅是文字；插件工具卡片从受保护的会话产物路径读取图片。首版只支持 DSH **native 直接工具调用**；PTC `run_code` 的嵌套调用会拒绝，避免成功但没有会话图片卡片。本功能尚未在隔离 Loader/profile、浏览器 UI 和真实账号上完成端到端验收，作为 v0.1.0 的实验能力提供，当前开关和注册行为已经过模拟及构建检查，真实账号生图仍需单独验收。
- 模型、取消与工具调用仍缺真实账号验证；登录状态刷新、退出与卸载的竞态只经过确定性的模拟测试，未在真实账号下验证。
- 没有订阅额度、重置时间或 reset 卡功能。一次请求的 token 用量**不是**订阅额度，不能据此推算账户剩余额度。
- Desktop 的安装、窗口适配与系统浏览器授权尚未实测；不要把 Web 的模拟或构建测试视为 Desktop 验收。不同电脑之间不复制 OAuth 凭据文件。
- 不要在仓库、日志、聊天或截图中披露令牌、授权码、完整 OAuth 回调 URL 或真实服务端响应。

## 开发与发布

本仓库定义 `pnpm typecheck`、`pnpm test`、`pnpm test:package`；它们覆盖类型检查、模拟测试和构建后的 Client 激活，但**不替代**真实 Loader/profile 与账号测试。架构及分阶段验收见[实施计划](https://github.com/HuaiminHuang/dsh-subscription-plugin/blob/main/docs/IMPLEMENTATION_PLAN.md)；[Codex CLI 生图链路调查](docs/CODEX_IMAGEGEN_INVESTIGATION.md)与[独立生图工具及 Skill 计划](docs/IMAGE_GENERATION_TOOL_PLAN.md)记录证据、实现边界和**仍未完成的验收**，不是已发布功能声明。维护者发布 tarball 的条件与流程见[发布说明](https://github.com/HuaiminHuang/dsh-subscription-plugin/blob/main/docs/RELEASING.md)。修改本项目时还应遵循 [AGENTS.md](https://github.com/HuaiminHuang/dsh-subscription-plugin/blob/main/AGENTS.md)。

设置页和会话选择器使用同一份发现目录；已登录时可点击「刷新模型」重新获取。刷新失败会提示错误并保留当前列表，不需要退出登录。

## 模型控件与快速模式

安装插件后，会话模型控件使用 DSH 共享目录，输入栏按钮收起时显示型号与思考强度，选中快速模式时在型号前显示闪电，展开时固定显示“选择模型”：点击型号在同一弹层中切换到模型列表，选好后返回滑块页；拖动时连续移动，松手吸附到有效档位并保存，紧凑面板的滑块只包含该型号实际支持的思考档位，也兼容其他提供商的档位与默认值；左上角闪电独立请求 OpenAI 订阅模型的快速模式，右上角恢复默认思考强度与标准速度。快速模式不会生成额外型号；账号是否可用仍由服务端决定，会消耗更多订阅额度。速度选择保存在本次 Host 生命周期内，按会话和型号隔离；重启 Host 或退出登录后恢复标准模式。辅助标题/压缩请求保持标准速度。在插件面板中可独立关闭“紧凑模型滑块”，切回“模型 / 推理等级”菜单；OpenAI 订阅模型另有默认关闭的速度开关。关闭紧凑组件不会清除已选择的速度或思考强度。卸载整个插件会恢复 DSH 原模型控件。

目录发现成功时只使用过滤后的动态列表，不再补回未返回的静态型号；发现失败或为空时仍保留当前目录。该交互已覆盖构建包的模拟浏览器验证，尚未宣称真实账号的快速处理档位已经验证。
