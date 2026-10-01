# Codex CLI 生图链路调查（2026-09-27）

**性质：技术调查，不是 `v0.0.2` 的功能声明。** 本文区分固定版本开源实现、CLI 与插件专有授权的各一次本机观测、以及尚未验证的 DSH 集成假设。没有人工查看、复制或记录 OAuth 凭据；一次性进程仅在内存中使用插件 Host 所用的凭据接口。没有进行 TLS 抓包解密、保存原始 HTTP 报文或把生成的图片加入仓库。

## 证据与测试边界

- 本机 `codex-cli 0.157.1`，`codex login status` 只确认「Logged in using ChatGPT」；`codex features list` 显示 `image_generation` 为 stable/enabled。没有检查登录文件内容。
- 对照 [Codex CLI `rust-v0.157.1` 源码](https://github.com/openai/codex/tree/rust-v0.157.1/codex-rs/ext/image-generation)；相同版本号**不**证明本机二进制与该 tag 逐字节一致。
- 在独立的临时工作目录运行一次 `codex exec --ephemeral --ignore-user-config --skip-git-repo-check --sandbox workspace-write -C <temp> --json`，提示词仅要求一张无文字的蓝底黄星插图，明确禁止 CLI/API-key fallback 和占位图。子进程中移除了 `OPENAI_API_KEY`、`CODEX_API_KEY` 环境变量；未触碰用户正在运行的 DSH Web 服务。`--ephemeral` 用于避免持久化该次 Codex 会话。
- 观测器边读 JSONL 边仅保留事件**类型、相对时间和状态**，丢弃消息正文、命令内容、base64、会话 ID 和错误详情；`strace` 只观察 `connect`，不读取 `send`/`recv`、TLS 明文、HTTP 头或包体。私有临时数据不属于发布附件。

## 开源实现所示的请求与返回路径（**不是解密抓包结果**）

1. [`extension.rs`](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/ext/image-generation/src/extension.rs) 依据当前模型提供方配置注册独立的 `image_generation` 工具；skill 的 Markdown 只是触发/提示说明，不是工具的实现。
2. [`tool.rs`](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/ext/image-generation/src/tool.rs) 把普通生图参数整理为 `ImageGenerationRequest`：`prompt`、`model: gpt-image-2`、`background: auto`、`quality: auto`、`size: auto`。已有图片的编辑走另一请求类型。该工具通过 [`backend.rs`](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/ext/image-generation/src/backend.rs) 读取当前提供方和认证，由 CLI 自己负责认证生命周期；不会因为第三方 DSH 登录而读取 DSH 的凭据。
3. [`model-provider-info`](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/model-provider-info/src/lib.rs) 为 ChatGPT 登录选用 Codex 后端基址 `https://chatgpt.com/backend-api/codex`；[`ImagesClient`](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/codex-api/src/endpoint/images.rs) 向该提供方追加 `images/generations`（或编辑时的 `images/edits`）发送 `POST`。认证层可附加 Bearer 令牌和账号路由头；这里只记录**头的类别**，绝不记录其值。这是 Codex 产品后端路径，不等于公开的 `api.openai.com/v1/images/*` Platform API，也不是已承诺给第三方插件的稳定协议。
4. [响应类型](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/codex-api/src/images.rs) 含 `data[].b64_json`，可有 `generation_id`、尺寸、质量等元数据。CLI 的 `tool.rs` 读取第一张图片、解码 base64 并保存 PNG；保存失败时也可能已经生成了服务端图片，需要分别检查返回与本机文件结果。工具回送给模型的内容包括内联图片数据和可选的本机路径提示；日志用 `[generated image]` 占位，不能把工具的原始响应直接写入日志/会话诊断。
5. [产物路径计算](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/ext/image-generation/src/artifact.rs) 由 CLI 管理。用户需要工作区文件时，CLI 可再复制选中的生成物；不要把这个默认目录当作 DSH 的公共附件存储。

**示意形状（字段来源于固定版本源码，不是本机原始报文）：**

```text
POST <Codex backend>/images/generations
Authorization: Bearer <不记录>
ChatGPT-Account-ID: <不记录，仅在适用时>
{ "model": "gpt-image-2", "prompt": "<测试提示词>",
  "background": "auto", "quality": "auto", "size": "auto" }

<成功响应结构，未采集 HTTP 状态或原始响应头>
{ "data": [{ "b64_json": "<不记录图片字节>" }],
  "background": "<可能返回>", "quality": "<可能返回>", "size": "<可能返回>" }
```

## 本机观测结果

| 阶段 | 本次观测 |
| --- | --- |
| 启动 | 0 秒：`thread.started`、`turn.started` |
| 中途 | 8 秒：一条 agent 消息；49 秒：一次命令执行开始/完成（未保存命令文本） |
| 完成 | 53 秒：agent 消息与 `turn.completed`；65 秒：进程退出码 0 |
| 文件 | 临时工作目录出现一张 PNG，1254 × 1254、874036 字节；人工查看与测试提示相符；与 CLI 自有生成目录中本次新文件的 SHA-256 完全一致，说明已回流并复制为本机文件 |
| 网络可见性 | 仅观察到 17 次 IPv4 `connect`，目标均为本机配置的代理端口；**不是** 17 个独立图片 HTTP 请求，也不能由此读出远端域名、HTTP 状态或响应正文 |

本次测试证明这台机器上这版 CLI 的一次真实生图与文件回流，不证明重试、编辑、取消、多用户、额度或 DSH 插件能复用相同请求。CLI 的 `--json` 可见事件也不足以还原服务端原始图片响应；TLS 流量未解密，**没有得到完整原始 HTTP request/response**。

## Desktop profile 的插件专有授权实测（2026-09-27）

用户明确要求在当前 DSH 登录状态下等待真实图片返回。正在运行的 DSH Desktop profile 已启用 `@h2mzzz/dsh-openai-subscription@0.0.2`；其设置页实际显示「已登录」。该 UI 状态及 pi-ai 静态模型可用性本身都不是服务端生图权限证明。Web profile 此时安装的是旧无 scope 包且没有运行，不参与本次测试。

在**独立的一次性 Node 进程**中，使用该 Desktop profile 的 DSH `LocalCredentialProvider`、插件独有的 `dsh-openai-subscription/codex` 记录、与插件相同的 `codexCredentialStore` / `isolatedAuthContext` 和 pi-ai `models.getAuth('openai-codex')` 获取新鲜请求认证；只从该 access token 内校验配套的账号路由 claim。没有读取 Codex CLI 凭据、使用环境 API key、输出凭据值，或重启／替换正在运行的 DSH。进程级凭据提供方的 `modifyRecord` 路径使用目标 DSH 的文件锁处理可能的刷新；进程退出时已释放服务资源。

用同一 grant 对源码指示的固定 Codex 图片路径发起**一次** HTTPS JSON `POST`，模型 `gpt-image-2`，提示词是蓝底中央一颗黄色五角星，无文字、人物或 logo；没有重试，也没有附加伪装 CLI 身份的头部。**实际收到 HTTP 200、`application/json` 和 `data[0].b64_json`**；解码后得到一张 1254 × 1254、955467 字节的 PNG，SHA-256 为 `d89b21867ab215daee4fd4d4fe0e3921491383056f48e70bd676b6167293f804`。文件只保存到仓库外 `/tmp/opencode/dsh-plugin-image-probe/`；`file` 检测为 PNG、Pillow 完整解码通过，人工查看画面与提示词一致。没有保存原始 HTTP 报文、token、账号 ID、base64 响应或图片到仓库。

**证据范围**：这证实当前 Desktop profile 的**插件自有 grant**在该时刻能向图片后端完成一次真实生图和本机字节回流，比此前仅有 CLI 自有登录的结论更进一步；但请求是在一次性进程中完成，**不是已发布 Bundle 内部的 Host 工具**，也没有接入 DSH `ctx.attachments`、Session、Client 或验证取消／退出与 UI 展示。不能据此宣称所有能登录的订阅用户、未来模型／端点或 Desktop 完整客户端流程已获支持。服务端是否长期允许第三方插件使用该 Codex 专用路径，仍没有稳定接口保证。

## 对 DSH 插件的可迁移部分与决策

- **可迁移的机制**：在 Host 内定义显式的生图工具（不把它伪装为文本 `LlmAdapter`），保管**本插件自己的**授权、刷新并串行化同一 grant 的写操作；请求成功后验证响应、限制图片大小和类型、保存到 DSH 附件能力，再只向 Client 返回附件引用/安全状态。工具请求的超时、取消、退出与卸载必须覆盖网络和文件阶段，防止部分产物/迟到回调。DSH 的附件 seam 见目标版本的 [`attachment.zh.md`](https://github.com/deepseek-ai/deepseek-harness/blob/477b4f420553e8a52c2fbccc464d7561b239c443/docs/subsystems/attachment.zh.md)。
- **不能直接声称可用**：当前 `src/pi-context.ts` 只转换文本与普通工具调用，遇到图片内容会拒绝；`v0.0.2` 没有生图工具或结果附件 UI。CLI 的图片后端是产品专用接口，参数、权限、速率和协议可能变化。此前 CLI 登录本身不能证明插件自有 grant 可用；后来虽在独立进程得到一次成功，仍不证明已发布 Bundle 的 Host 工具/Client 交付成立；不应复制 CLI 的凭据、静默使用环境 API key、通过浏览器抓取图片或把 Bearer token 传到 Client。
- **建议的验证顺序**：现在已对当前 Desktop profile 的插件自有登录做了一次**独立进程**生图探测；下一步才是在经用户授权的隔离 DSH profile 开发 Host 工具／附件／Client 的端到端原型，并核实取消、失败分类与额度行为。再决定是否把 Codex 专用后端作为明确标注实验性的可选 Host 工具。若没有稳定、适用的服务端契约，优先选择本机独立的 Codex CLI 桥接（需 CLI 自己登录、只限受信任机器），或另行配置付费 Platform API key；都不应把实验路径直接并入现有订阅模型路由。

## DSH 自有登录复用：通信依赖与拟议实现

```text
用户 → DSH Web/Desktop Client → 插件 Host 授权流程 → auth.openai.com OAuth
                                 ↓ 插件专有 CredentialKey，Host 持有 grant
用户明确请求生图 → DSH Agent 工具或设置页 Remote → 插件 Host
  → pi-ai models.getAuth('openai-codex')：必要时在原 grant 上串行刷新
  → Codex 专用图片后端：HTTPS JSON 请求（Bearer access + 同一令牌关联的账号标识）
  ← JSON 图片数据或拒绝／限流（由服务端决定账号是否有资格）
  → Host 限长、解码、验证格式／尺寸并存入 DSH 附件服务
  → Client／Session 只接收可授权读取的附件引用与安全状态，不接收令牌或原始响应
```

**这不是两个 Client 互传令牌。** CLI 和本插件即使登录同一账号，原先也是各自独立的 OAuth grant。拟议的直连方案仅在 DSH Host 使用**本插件自己的** grant，不读取 CLI 文件，也不要求用户安装 CLI。备用的“调用本机 CLI”方案则完全相反：CLI 必须自己拥有有效登录，插件只接收退出状态和已经生成的本机文件，不分享两个应用的凭据。

1. **身份与更新**：当前 `src/controller.ts` 通过 `createModels({ credentials: codexCredentialStore(ctx), authContext: isolatedAuthContext })` 将 pi-ai 限定到插件自有的 `dsh-openai-subscription/codex` 记录。安装的 `pi-ai@0.85.1` 的 `openai-codex` OAuth 保存 `{ access, refresh, expires, accountId }`；`models.getAuth(PI_PROVIDER_ID, { signal })` 才是获取**新鲜请求认证**的入口，内部通过 `modifyRecord` 串行刷新。返回 `auth.apiKey` 在此上下文实际上是 **OAuth access token**，不是 OpenAI Platform API key。`accountId` 来源于同一令牌的受限 JWT claim，必须在 Host 配对提取并交由服务端核验，不能由 Client 填写，也不能凭本地解码自称已通过账号资格校验。
2. **请求协议**：现有 pi-ai 文本路由向 Codex 后端的 `codex/responses` 请求文本／工具输出；固定版本 CLI 的 [`ImagesClient`](https://github.com/openai/codex/blob/rust-v0.157.1/codex-rs/codex-api/src/endpoint/images.rs) 则使用 JSON `POST`，图片生成为 `images/generations`，编辑为 `images/edits`。它们不是同一个模型请求。图片的请求参数和回应类型见上文。本次独立进程使用了插件自有 access 与同一令牌的账号 claim，绑定固定 Codex 来源，请求得到 HTTP 200；不得将 grant 发送到任意 Client 输入的 URL，或假扮 CLI 特定头部绕过服务端拒绝。该账号的一次成功不等于第三方稳定接口承诺，也不证明其他头部／模型组合或用户有资格。
3. **交付协议**：Codex 后端回应中的 `data[].b64_json` 是图片字节的编码，不是公开图片 URL。Host 先限制总响应大小和图片张数，再解码并调用 DSH 的 `ctx.attachments.saveImage({ data, mediaType, name })`；附件提供方校验声明类型与真实内容并返回持久引用。Client 应通过 DSH 受控的附件读取路径展示／保存图片，不能收到服务端原始 JSON、base64 或宿主临时文件路径。若工具结果需要进入 Agent 历史，仍须核对当前 `codex-subscription` **只接受文本输入**的限制：不可把图片块直接喂回这个模型，避免构造一份运行后才报错的工具结果。
4. **生命周期与费用**：在取 auth 之前登记请求，覆盖刷新、HTTPS、解码、附件提交整个阶段；退出和卸载先停止新任务、取消并等待已有任务，避免删 grant 后迟到请求复活状态。`401/403`、`429`、超时、图片校验失败、文件系统错误应分别展示安全类别，不得从图片失败推出文本模型登录失效。网络中止也不能保证服务端没有计费／计入使用限额。根据 [Codex 官方计费说明](https://developers.openai.com/codex/pricing#image-generation-usage-limits)，图片生成与普通 Codex 使用共享限额、消耗更快；**Free 计划不提供生图**。可登录不等于该账号有图片权限，限额与重置时间仍需服务器的明确事实来源。
5. **适用用户边界**：当前实现是**每个 DSH Host/profile 一个插件专有 grant、一个登录状态**，不是“同一 Web 服务中每个访问者各登录自己的 ChatGPT 账号”。若要共享 DSH Host 上多用户独立生图，先需要可信用户身份、按用户隔离的 CredentialKey／授权流程、请求归属和附件访问控制；不能只让每个浏览器显示自己的按钮就宣称多用户支持。Web/桌面 Client 分别通过自己的 Host 使用同一套能力时，也必须各自完成安装与授权。

**下一道实证门槛**：已有 Codex CLI 自有登录和当前 Desktop profile **插件自有 OAuth grant** 的各一次真实生图证据，但后者不是 Bundle 内部的实现。尚未验证 Host 工具的异步生命周期、失败分类、DSH 附件和 Client 显示或跨账号／平台资格。在隔离 profile 完成真正的 Bundle 端到端验证之前，不修改当前发布包的能力声明；若以后服务端拒绝第三方客户端，应按拒绝处理，而不是绕过鉴权或切换到其他应用的凭据。

## Skill、Host 工具与 MCP 不能混为一谈

- 本机 Codex `imagegen/SKILL.md` 的默认路径明确调用 CLI **内置 `image_gen` 工具**，无需额外 Platform API key；其备用 `scripts/image_gen.py` 才要求 `OPENAI_API_KEY`。Skill 是决定何时及如何调用工具的说明，既不实现图片后端，也不保管 DSH 的 grant；把备用脚本直接搬进插件会改变计费身份。
- DSH 可以另写一个 `SKILL.md` 引导 Agent 使用生图，但可调用能力仍须由 Host 注册工具或安全的 Remote 提供：用插件自有凭据取得认证、固定请求目标、约束参数与响应、限时和取消、校验图片并保存附件，然后把**适合当前模型**的结果和用户可访问的产物投影出去。不能把临时文件路径或原始 base64 当作 Client 可读的交付物。
- DSH `@deepseek-ai/dsh-mcp-client` 已能独立连接每个用户配置的 stdio／Streamable HTTP MCP 服务，发现工具并以 `mcp__<serverName>__<tool>` 注册；它不会读取 Codex CLI 的 `config.toml`。可将现成的**非 Codex 身份专属** MCP 服务另行配置到受信任 DSH profile，但不应把插件的 ChatGPT access token 注入任意 MCP 子进程或 URL。Codex 自带 `image_gen` 也不是本机 MCP 服务。
- **当前关键阻断**：`src/adapter.ts` 只声明文本输入，`src/pi-context.ts` 拒绝图片块。目标版本 DSH 的 MCP 图片投影要求活跃模型明确支持 image 输入；否则会返回图片不可用诊断而非把图片送入模型。因此“生图 MCP 返回 image 块”目前不能直接完成本插件的用户交付。可先让 Host 保存图片并以受控附件／独立页面或文件交付给用户，给文本模型的工具结果仅包含可安全重放的文字状态；若以后要让模型看图，需单独实现并实测图片输入、附件重放及取消，而不是虚报模型能力。
- 搜索、命令执行、补丁、浏览器、MCP 等 CLI 功能各有本地工具／权限／会话生命周期，**不是**凭一次 ChatGPT OAuth 就自动出现在 DSH 中的后端端点。优先复用 DSH 已有工具与 MCP，只有验证了订阅专用的后端协议、产品权限和结果语义时，才考虑给本 Bundle 增加一项独立的 Host 能力。

实施边界、项目组织、工具契约和随包 Skill 的具体设计见 [生图工具与 Skill 设计计划](IMAGE_GENERATION_TOOL_PLAN.md)；该文件仍是**计划**，不代表功能已发布。
