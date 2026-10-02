# `image_gen` 工具与随包 Skill 设计计划

**状态：源码实现中，未发布／未完成端到端验收。** 本文定义 `@h2mzzz/dsh-openai-subscription` 中一个**随 Bundle 默认开启、可在插件面板独立关闭**的生图功能，不改变现有 `codex-subscription` 文本模型路由的职责。技术调查、两次各自独立的真实生图证据及接口不稳定性见 [Codex CLI 生图链路调查](CODEX_IMAGEGEN_INVESTIGATION.md)。目标仅为 DSH `0.2.0-rc.2`、提交 `639ed015397290b3745d163aafe02ffee4aa3f84`，以及其补丁版 pi-ai `0.87.1`；其他版本需重查实际 API。

**当前源码进度**：`src/imagegen/` 已实现固定端点/有界响应、单 grant 并发栅栏、文字工具结果与 `tool/result.meta` 产物引用、Session 事件核验的 `/api` Fetch 读取、随包 Skill 的登录态注册/撤销；`src/client/imagegen/` 有 keyed 工具卡片。生图模块由 `openai-subscription-imagegen` Loader 条目控制，随 Bundle 默认开启，无需 `imageGen.enabled` 设置。现有模拟测试与构建包 Client 槽位测试**不能证明**真实 Loader 组合、账号生图、图片预览/下载、重启后回放、断线重连或 Desktop GUI 正确。以下表格中的 A–D 阶段都仍需真实隔离 profile 的验收；不要改写已发布 `v0.0.2` 的能力声明。

**工具模式边界**：目标 Web 标准预设使用 native 直接工具调用；当前 `presentationMeta` 不为 PTC 子调用持久化，故本实现主动拒绝 `run_code` 内的嵌套生图，而不是生成了图却没有图片卡片。启用 PTC profile 前需先解决其产物关联/卡片回放，不可把当前工具称为跨模式支持。

**当前未满足的生命周期细节**：登出后只读路径仍保留历史图片；但若在插件面板关闭生图 Loader 条目，当前实现不会挂载只读路径，历史卡片暂不可加载（附件不会删除，再启用可尝试恢复）。发布前应将只读路线与新请求 owner 解耦，或明确采用其他仍可授权的历史产物交付方式；不得用永久暴露附件 ID 的公开路由规避这一缺口。

## 1. 范围与交付定义

- **一个现有 Bundle，独立功能模块**：本仓库仍只发布一个 npm 包和一个 Host/Client Bundle。内部新增 `imagegen` 子目录及包自有 Skill；不创建第二个需要用户安装的 npm 包、第二个默认启用的 DSH Bundle，也不修改官方 `openai`、`openai-codex` 或 `llm-pi-ai`。
- **工具是执行者，Skill 是说明书**：由 DSH Host 注册 `codex_generate_image` 工具；Skill 告诉 Agent 何时调用、如何整理提示词与核对成品，不能自行执行 HTTP、读取凭据或替代工具。Codex CLI 内置 `image_gen` 不是 MCP 服务；它的备用 Python 脚本需要另一个 Platform API key，**不复制为本功能**。
- **最小产品范围**：用户明确要求时生成一张图片；首版不支持编辑、参考图、掩码、多图批量、任意模型/后端 URL、自动重试、额度推算或 reset 卡。图像生成失败不得使现有文本模型登录和路由失效。
- **完成的含义**：服务端实际返回图片，Host 全量校验并持久化，Agent 得到可重放的**文字**工具结果，用户在当前会话的插件工具视图中能查看/下载相应图片；重连与重启后仍能恢复显示。只生成临时文件、返回附件 ID 字符串，或只让模型说“完成”，均不算交付。
- **发布约束**：Codex 产品专用 `images/generations` 不是承诺给第三方的稳定公开图片 API。一次当前账号使用插件 grant 的 HTTP 200 只证明该次实验；本功能须单独标记为实验性，提供插件面板的独立启停和撤销，不把可登录或静态模型目录误当生图资格。

## 2. 组件和数据所有权

```text
DSH Agent ──(受策略约束的工具调用)──> imagegen/Host Tool
                                          │ 用最小 Host-only auth lease
现有 controller ──(插件专有 grant + 串行刷新 + 退出屏障)──> imagegen/backend
                                          │ 固定 Codex 图片来源，HTTPS，单张响应
                                  imagegen/result ──> ctx.attachments.saveImages
                                          │ 持久引用 / 无令牌的工具元数据
DSH Session ──(文本 tool/result + 产物关联)──> imagegen/Client Tool View
                                          │ 同源、经认证且验证归属的图片读取
                                          └──> 用户预览/下载

包内 SKILL.md ──(启用时注册到 ctx.skills)──> Agent 的 skill 目录
```

| 所属模块 | 应拥有的事 | 不允许做的事 |
| --- | --- | --- |
| `src/controller.ts` 与 `src/credential-store.ts` | OAuth、授权记录、pi-ai 刷新、活跃请求/登出/卸载屏障；向同一 Host 中的生图模块提供**窄的授权调用入口** | 加入图片业务状态/卡片、建立另一份凭据或让 Client 取得 token |
| `src/imagegen/` Host | 工具准入、网络协议、尺寸/大小与响应验证、持久化、产物关联、清理 | 修改文本适配器的模型目录/推理档位，扫描 CLI 文件，依赖环境 API key，任意 URL 转发 |
| `src/client/imagegen/` | 会话内专属工具卡片、经授权加载附件、失败/取消反馈 | 持有原始 OAuth grant、图片后端原始 JSON/base64、宿主文件路径 |
| `skills/codex-subscription-imagegen/SKILL.md` | 触发条件、提示词指导和成品核查、仅调用本包工具 | 直接运行脚本、隐式 API-key/CLI fallback、宣称账号必有生图权限 |

同一个 Bundle 的 `src/index.ts` 装载现有 controller，`src/imagegen-entry.ts` 作为独立 Loader 条目通过 `codexSubscription` 服务依赖挂载 `imagegen`；它接收一个只在 Host 使用的授权能力，例如 `withImageAuth(signal, fn)`，而不是新建一套 `createModels()` 或直接读取磁盘记录。该能力在刷新前登记到现有 `openRequest()`，在回调里调用同一个 `models.getAuth(PI_PROVIDER_ID, { signal })`，把新鲜 access **仅传给 Host backend**，后者从同一 access 读取账号路由 claim；在回调完成（包含图片提交）后释放。登出仍先阻止新请求、取消并等待进行中请求，再删除 grant。不要把 `models` 或完整 credential 对象暴露给 Client/Remote。若为了这个窄边界需要小幅改动 controller，应仅增加此 Host 内部入口，不改 `CodexSubscriptionAdapter`、`src/pi-context.ts` 或现有登录 Remote 行为。

**装载依赖**：工具需要 DSH `tools`、`attachments`、`connection`（用于受保护的图片 Fetch 路径），Skill 需要 `skills`；按目标 DSH 实际服务声明 `inject`，真正可选的 UI/skill owner 用 `ctx.get(name)` 或独立 effect 判定。缺少必需能力或图片产物读取通道时，**只拒绝启用 imagegen 子功能**并给出可诊断状态，不让它成为现有文本登录/模型路由的强制依赖。包级 `dsh.client.inject` 仅用于 Client 模块装配，不冒充 Cordis 服务依赖。

**插件面板启停**：一个 npm Bundle 包含 `openai-subscription`（订阅接入）和 `openai-subscription-imagegen`（生图工具）两个 Loader 条目，默认都开启。用户在 DSH 侧栏「插件」→ 本组合包中使用「OpenAI 生图工具」开关；面板调用现有 `pluginManager.setPluginEnabled`，保存生图行的 `disabled` 覆盖。无需额外的 `imageGen.enabled` 配置，也不修改 DSH 核心面板。关闭生图条目撤销工具、Skill 和读取路径，取消并等待在途生图任务；订阅接入条目和文本模型继续运行。重新打开时复用当前插件自有登录，未登录时不公布工具。关闭订阅接入后，生图条目因依赖缺失而暂停。图片相关 peer 可选，缺包或服务缺失只影响生图条目。

**仍待完成**：关闭生图条目期间历史卡片的读取路径不可用，附件不会被删除，再启用可尝试恢复。只读路径与新请求 owner 的解耦仍需单独验收。插件面板启用状态代表装载意图，不代表账号已获服务端生图资格。本期仍仅支持受信任的单用户 Web/native 工具模式。

## 3. DSH 工具契约与显式准入

工具名固定为 `codex_generate_image`，与 npm 包名、`codex-subscription` 路由及 CLI 内置 `image_gen` 各自独立。使用目标版本 `@deepseek-ai/dsh-tools` 的 `defineTool()` / `ctx.tools.register()`，通过 owning effect 注册/撤销；不在 `LlmAdapter` 里伪造图片模型调用，也不加一个不必要的 MCP 服务器。

| 字段/行为 | 首版契约 |
| --- | --- |
| 输入 | `{ prompt: string }`，非空且有明确长度上限；初版不开放 `model`、`n`、`size`、`quality`、目标路径、URL 或令牌参数。生成默认使用已实测的 `gpt-image-2` 与 `auto` 参数；服务端变化时明确失败而非暗中切换模型。 |
| 调用身份 | 必须有正在运行且受允许的 `exec.agent` 与已确认的工具启用状态；在 Host 校验当前 profile、调用来源/归属及插件自有登录。技能目录或前端按钮**不是**权限边界。共享 Web Host 当前仅一份 grant，不能把所有访客当成各自登录的账户；未证明可信用户隔离前不对多用户共享部署启用。 |
| 执行 | `exec.signal` 贯穿 auth、网络读取和附件提交；工具设置覆盖真实生图时长的合作式 `timeoutMs`（从测试定值，绝不靠固定 sleep），限制同一 grant 的图片生成并发；首版不声明 `isConcurrencySafe: true`，默认一次只向后端发一张且不自动重试。 |
| 规范输出 | 只含成功状态、与本次 `callId`/Session 可关联的产物标识和经验证的非机密图片引用/元数据；不含 token、account ID、请求原文、HTTP 响应正文或 base64。`output.schema` 校验；`output.render()` 仅返回**文本块**，以适配当前文本模型。成功文字只能在附件保存和产物展示关联成功后出现。 |
| 呈现 | 可选的 `output.presentationMeta()` 与 `presentCall`/`presentResult` 保持纯函数且可重放。图片引用不塞进模型可见图片块；图片卡片读取经过最终策略/结果确认的产物关联，不因工具失败或 post-execute 替换而展示旧附件。 |
| 失败 | 未登录、无图片资格/拒绝、429、超时/取消、无效响应、图片存储失败分成安全类别；不日志化提供方 body/header/token，不删除可用的文本 grant。断连/取消不承诺服务端未计入订阅额度。 |

工具可用性与 Skill 可用性使用同一开关和登录状态驱动，保证禁用/登出/卸载后 Agent 的新步骤不再收到误导性的可调用项；已开始的任务必须走取消和等待屏障。即使目录/界面旧快照暂时可见，`execute` 仍重新验证身份、启用状态和请求生命周期。`isConcurrencySafe` 的默认独占只约束同一 Agent 的工具调度，**不足以**串行化不同 Agent 对同一订阅 grant 的生图；Host 还需单独的并发上限/队列并清理取消的等待者。是否增加按次用户批准需先与 DSH 的现有工具权限/审批服务组合验证；不可用“模型自己判断”替代访问控制。

### 参考生成扩展（源码已接入，尚未发布）

用户已确定每次参考生成最多输入 **10 张参考图片**。这是插件的产品上限，不是订阅后端的硬上限；2026-10-02 的隔离 Web 实验中，后端接受过 64 张小型参考图，末张独特图形也实际影响了生成结果，但未确定服务端的最大数量或全部参考图同时有效的范围。

工具参数描述声明最多 10 张，Host 执行入口强制限制数量（目标 DSH 的工具 schema DSL 不支持 `maxItems`）；第 11 张在附件读取、授权借用和网络请求之前明确报错，不自动截断。零张参考图继续走现有提示词生成；1–10 张走 `images/edits`，由 Host 读取当前会话可访问的附件并构造 `images[].image_url`。每项 `reference_images` 指定一个 `attachment_id` 或 `tool_call_id`；前者必须属于当前会话的用户图片或成功工具图片，后者必须匹配本插件成功生图的调用与结果。图片格式、20 MB 单图及 50 MB 总大小分别校验。

自动化验收包含 10 张正常输入、11 张超限且不借用授权/不读取附件/不发请求，以及现有纯提示词生成的兼容检查；并验证会话归属、历史结果引用、取消和卸载。新版正式工具已在真实隔离 Web Agent/Session 中完成 10 张参考生成及附件保存，浏览器流程仍未验收，见[验证记录](REFERENCE_IMAGE_VALIDATION.md)。当前发行包未包含这项源码扩展。

## 4. 图片后端与不可绕过的信任边界

1. 固定 `https://chatgpt.com/backend-api/codex/images/generations` 和 JSON `POST`；只从同一新鲜 OAuth access 中提取、校验账号 claim，发送 Bearer 和对应账号路由头。沿用插件已有串行 `getAuth()` 刷新，不允许把凭据送到调用者提供的 URL、跳转目标、第三方 MCP、CLI 或前端；拒绝跨域/重定向。无需模拟 CLI 的私有会话标头。
2. 在**读取完整响应前**限制 HTTP 状态、`Content-Type` 和流累计字节；限制图片张数、base64 格式/编码长度、解码后字节数与尺寸。只接受经目标附件提供方实际解码、验证和归一化的媒体类型；不要只凭扩展名、服务端声明或 PNG 魔数宣称成功。任何验证失败均不向 Client/Session 投递原始提供方 JSON。
3. 用 `ctx.attachments.saveImages([{ data, mediaType, name }])` 完成验证和持久化。先保存，再公布不含图片字节的引用；发布中止或 Session 不可用时不得谎报“用户已经拿到图片”，对可能遗留的不可达内容按附件服务保留策略处理。下载仍需读取权校验，附件 ID 不是授权令牌。
4. 图像失败与 `getState()` 的登录状态分离：HTTP 401/403 可以表示授权问题，也可能仅是图片资格/策略失败，不得因此注销文本适配器。速率限制与 reset 时间均以服务端事实为准，不推测额度。

## 5. **必须先验证**的会话图片交付设计

当前 `src/adapter.ts` 报告 `inputModalities: ['text']`，`src/pi-context.ts` 遇到图片块就拒绝。DSH `mcp-client` 的图片投影也要求当前模型支持图片输入；**不能**直接让工具结果返回图片块来换取默认图片卡片，否则下一轮重放会失败。目标 DSH 的 `session/attachment` 只授权特定第一方会话事件里的图片块，**不**因为附件已保存、放在 `tool/result.meta` 或自定义事件中就自动授权读取。

拟采用一条不碰文本模型转换器的独立交付链；在开发网络后端前先做一个假图片的端到端可行性试验：

1. 工具执行返回文本；**优先**通过目标版本的 `output.presentationMeta()` 将已保存附件引用写入同一次成功的 `tool/result.meta`，以 Session 事件本身作为可重放的产物关联；调用名、`sessionId`/`callId` 和最终结果状态必须一起验证。不能根据提示词、可猜测路径或单独的 `attachmentId` 构造下载权限。必须核对 `tool/result` 的记录/呈现顺序及策略替换：如果成功的工具文本和可见产物不能保持一致，就不发布该 Agent 工具。不得仅靠 `tools/result` 观察者补写事件——该观察者失败会被包含，不能当成提交成功的保证。如原生 `meta` 路径不能满足一致性，先验证正式的持久关联机制，再决定是否增加插件自有持久索引；不可用内存 Map 冒充回放支持。
2. 在 Host 注册精确路径的 `ctx.connection.fetch.register()`，走 DSH 已有 `/api` Host/Origin 与浏览器认证栅栏，**不要**直接添加未经鉴权的 `ctx.webServer.register()` 静态图片路径。每次读取按可信的会话/调用标识查对应 Session 中**成功的**插件工具结果及 `meta`（须先核对插件能否通过目标版本正式的 Host 会话读取接口取得该事件），再验证引用、有效性和访问策略，由 `ctx.attachments.readImage()` 读取；不接受任意用户指定的附件引用或 Host 路径。限制 GET/HEAD、响应字节、类型、缓存与错误细节；断线/重启后重读持久事件，不靠内存 Map 伪装耐久性。若该读取/授权链在目标 API 无法成立，就停止聊天内图片交付，而不是猜测私有 Session 文件位置。
3. Client 在独立的 `tool.call.toolview` keyed slot（key 为 `codex_generate_image`）注册插件自有工具卡片，通过有权限的加载器预览/下载，而不覆盖现有 `read_image` 或官方页面。DSH 现成的 `tool.call.images` 插槽携带的是**会话授权 loader**；目前插件元数据不满足那条授权规则，未经单独证实不能直接复用它。未知或畸形历史产物降级为安全的文本状态，不能从 ID 拼出 URL。
4. 当前 DSH 浏览器认证代表的是一个 Host **operator**，并非访问者独立 ChatGPT 账号。上述交付只拟在隔离、受信任的单用户 Web profile 验证；如需共享 Web 多用户，须先引入可验证的用户/Session 归属与独立 grant，再开放图片读取。若目标版本无法在插件边界完成授权和耐久性，不用“返回 base64 到 Remote”掩盖缺口：延后聊天内图片呈现/发布，或单独评估 DSH 原生附件扩展点，不更改核心会话 API 来绕过它。

## 6. Skill 的形态、打包和启停

- 文件：`skills/codex-subscription-imagegen/SKILL.md`，包含 name/description 和简短指导；**没有** Python fallback、真实账号数据、API key、依赖 `~/.codex` 的路径或要求 Client 处理图片响应的代码。Skill 中工具名称应与 Host 注册一致，写明明确请求才生成、一次一张、失败不可假装已生成、不要从用户图像修改要求推断本期支持编辑。
- 注册：Host 在生图条目启用、登录完成且工具确实可用时读取和校验**包内** Skill 内容，调用 `ctx.skills.register({ name: 'codex-subscription-imagegen', description, source: 'runtime', content: body, ... })`。`ctx.skills.register` 不解析前置信息，加载器须只传 Markdown 正文并核对字段一致；若正文无需相对资源，省略 `resourceBase`。不用 `~/.dsh/skills`、`~/.agents/skills`、`~/.codex/skills` 的写入或 symlink，也不调整 DSH 全局 `skill-filesystem` 扫描器。
- 生命周期：Skill 与写入型生图工具属于同一个可选功能 owner，注销时两者都撤销；插件卸载、功能关停或登出后不留下误导性的目录条目。历史图片只读呈现另有 Bundle 生命周期，不依赖仍保持登录。项目 Skill 可以按 DSH 目录优先级覆盖同名 runtime 条目，故采用独特前缀并在诊断中区分覆盖和未注册。目标 Web profile 的 Host skill registry 存在，但 Web 把默认全局 `skill-filesystem`/`tool-skill` 行停用，Agent preset 自己挂 `tool-skill`：须在真实 profile 中验证**该 Agent**看得见全局 runtime Skill；只检查 `ctx.skills.list()` 不等于模型一定会加载它。
- 打包：更新 `package.json` 的 `files` 和构建/包检查，使 tarball 确实含 Markdown，并在**从构建后 tarball 安装**的 profile 中检查 `skills.list/get`、工具 schema、登录前后和卸载后的撤销。若包外 Markdown 解析/路径无法可靠运作，考虑构建时将静态正文嵌入 Host 输出；仍保留可阅读的包内源文件并验证两者同步，不复制到用户目录。

## 7. 建议的文件组织（规划，不是当前文件清单）

```text
src/
  index.ts                          # 订阅接入条目：授权、凭据与文本路由
  imagegen-entry.ts                  # 生图条目：独立开关、服务依赖与 owner 生命周期
  controller.ts                     # 只增加窄的 Host 授权调用入口及任务屏障复用
  adapter.ts, pi-context.ts         # 首版保持原样（文本模型）
  imagegen/
    index.ts                        # 可选开关、依赖与 owner 生命周期
    tool.ts                         # defineTool、schema、输出与准入
    backend.ts                      # 固定图片端点、请求、取消、错误分类
    response.ts                     # 有界 JSON/base64/媒体验证
    artifact.ts                     # 附件提交、Session 关联、受控读取
    skill.ts                        # 包读取、校验及 runtime skill 注册
  client/imagegen/
    ToolImageView.tsx               # keyed tool.call.toolview，可重放的状态和预览
    locales.ts, *.module.css        # 中英文、DSH 语义 token，复用原有 primitives
skills/codex-subscription-imagegen/SKILL.md
tests/imagegen/*.spec.ts           # 全部用合成图片/无机密的响应 fixture
```

`src/client/index.ts` 只添加拥有自己 effect 的可选 Tool 视图注册，不把图像业务塞进当前 OpenAI 登录设置页；现有 Typert `codexSubscription` Remote 不扩展为传递 token/响应的代理。若确需显示功能启用状态，仅增加不含机密的最小配置状态。第一版与现有登录/文本路由共享 **同一 grant 和任务屏障**，除此之外保持模块隔离。

## 8. 阶段、测试和退出条件

| 阶段 | 具体产出与必须通过的门槛 |
| --- | --- |
| A. 交付可行性 | 用**合成**图片和 fake grant 验证 `tool/result` 最终策略、产物关联、独立 Fetch 鉴权、工具卡片回放、重启后关联读取、断线/卸载撤销；若无法安全给文本模型返回文字同时给用户图片，就停止 Agent 工具上线，不靠 Mock 声称图片 UI 可用。 |
| B. Host 协议 | mock 服务端覆盖 200 真图、错误状态/不合规范 JSON、空/多图、大响应/解码膨胀、重定向、图片校验失败、附件存储失败、刷新失败与网络取消；任何失败均不改变有效文本登录。鉴权、端点和模型参数不可由工具 args/Remote 覆盖。 |
| C. 竞态与打包 | 使用可控屏障交错登录刷新、两次生图、登出、工具禁用和 Loader 卸载；断言一次 grant 上无并发刷新写、停止新调用、请求/监听/计时器完全 settled、迟到回调不发布。测试真实 tarball 中 Host/Client/Skill 装载和撤销，验证未配置时两个条目默认启用，单独关闭/重启生图条目或缺少图片服务时不影响文本路由。 |
| D. 隔离真实验收 | **经授权**在独立 Web profile 安装构建包，仅使用插件自有 grant 发出一次真正的生图；等待返回、持久化、用户预览/下载与重启回放，然后验证取消/拒绝/429 的实际行为（条件不具备则明确标未测）。Desktop 另行验收窄屏、窗口 chrome、深浅色、键盘/focus/断线，不以既有 Desktop 的一次性 Node 探测冒充 GUI 验收。 |

测试资源原子分配：临时目录 `mkdtemp`、模拟服务器 `listen(0)`，每例拥有自己的存储与取消信号；用明确的 readiness/barrier 而非 sleep；`abort()` 后还须等待关闭/任务完成。权限测试要断言**错误会拒绝真实 HTTP 读取**，不只看工具自己的“已取消/已卸载”标记。隐私检查只允许合成图片和安全状态进入 fixture/日志；不保存实际 grant、原始服务端响应或真实生图到仓库。

当前源码实现不更改已发布附件的能力。按本仓库脚本运行 `pnpm typecheck`、`pnpm test`、`pnpm test:package`、`npm pack --dry-run` 和 `git diff --check`，再**独立完成** Loader/profile + 真实账号检查；任何缺口要在 README 与发布说明中逐项标注，不能把一次成功请求推广为全部账号的稳定支持。
