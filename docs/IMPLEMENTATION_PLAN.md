# Codex 订阅插件实施计划

**状态：待实施。** 本文记录拟交付行为和需要实验确认的接口，不是现有功能说明。核查基线为本地 DSH `0.1.7-rc.2` 源码和 2026-09-27 可见的 [Codex App Server 文档](https://developers.openai.com/codex/app-server)；发布前须对实际安装版本重新核查。

## 1. 目标与边界

用户从目标 DSH profile 的 Plugins 页面启用一个独立 Bundle，在原有设置窗口的 **OpenAI / Codex** 页面完成 ChatGPT 浏览器授权；授权后从原有会话模型选择器选择 Codex 模型，通过 DSH `LlmAdapter` 完成真实对话，并在设置页查看该账户实际提供的额度窗口、已用比例与重置时间。可用 reset 卡如能从同一登录态可靠读取，单独展示；使用 reset 卡必须由用户明确确认。

插件默认不进入 Web、Desktop 或 Headless 组合，不修改官方 `llm-pi-ai`、`ui-settings-models`、`api-remotes`、DeepSeek 账户页或 Electron 原生窗口。当前目标是一个只支持 Codex 的插件包；多提供商、多账号池、Fast 模式、生图、搜索、跨提供商故障转移和财务账单均不在首版范围内。不能把“订阅额度”解释成 DSH 一次模型调用的 `TokenUsage` 或用户实际付款金额。

外部插件必须按 DSH 目标版本发布并声明经验证的 peer 范围。兼容性预检能拒绝已知版本不符，但不能替代真实启动、模型流或授权回调验证。启用后的插件代码仍与 Host 同进程运行：未处理的异步异常可能使应用退出，不能承诺插件故障绝不影响 DSH。

## 2. 已核查的 DSH 接口

| 需要的能力 | 当前接口 | 采用方式 |
| --- | --- | --- |
| 原有设置窗口新增导航与页面 | `settings.section` list slot | Client 插件注册独立页面，不替换官方模型或账户页面。 |
| 模型选择及请求 | `ctx.llm.registerAdapter()`、`LlmAdapter.listModels()` / `resolveModel()` / `prepareCall()` / `stream()` | 对外使用本插件独有的 provider ID，登录后才向选择器公布可用模型。 |
| 交互授权与撤销 | `ctx.authorization.registerFlow()` / `begin()` / `cancel()` | 一次尝试对应一个插件自有凭据键，Host 中转授权提示与输入。 |
| 凭据持久化及轮换 | `ctx.credentials` 的记录读写与 `modifyRecord()` | 只写插件拥有的 OAuth grant；为 pi-ai `CredentialStore` 实现薄的桥接。 |
| 浏览器与 Host 通信 | 插件自有 Host Remote、Client `ctx.remote.$mount()` | 仅返回脱敏状态、链接、进度和额度；不将 access/refresh token 送到浏览器。 |
| 订阅额度转设置页数据 | DSH 无与 `LlmAdapter` 对应的通用账户额度接口 | 插件 Host 自行查询、验证并投影，UI 独立显示。 |

`llm-pi-ai` 已有 pi-ai OAuth 凭据和授权流程，但其源码转换器不是外部插件的公共复用 API。本插件依赖 pi-ai 和 DSH 公开入口，不导入 `dsh-llm-pi-ai/src/*`，不占用 `llm-pi-ai/openai-codex` 凭据键或 `openai-codex` 模型路由。初期也不向官方可配置提供商目录登记 API Key 编辑项，因为插件页面拥有登录与模型设置入口。

## 3. 单包结构与数据所有权

首版优先采用**一个外部 npm 包、两个运行入口**，而非先拆分多个服务包：`src/index.ts` 为 Cordis Host 插件，`src/client/index.ts` 为浏览器插件，`cordis.patch.yml` 提供一个独立 Loader entry；包元数据声明 `dsh.bundle.patch` 与 Web Client entry。仅在 Host/Client 有独立发布需求时再拆包。没有独立 Node 应用或额外的公开命令行入口；应用通过现有 `dsh` profile 启动。

Host 内按责任划分模块：

1. **凭据与授权**：自有记录键（例如作用域 `dsh-openai-subscription`、ID `codex`）、pi-ai 凭据读写桥、浏览器授权交互、取消、退出；不能和其他插件共享可轮换的 refresh token 文件。
2. **模型适配**：独有 DSH 路由（暂定 `codex-subscription`），内部 pi-ai provider 仍为 `openai-codex`；模型目录、请求转换、流事件转换、工具调用、图像能力声明、取消和错误分类都由这个模块负责。
3. **额度读取**：只接收 Host 中已确认的登录态，按账户请求服务端，转换成受限的展示字段，设置请求超时；不得从一次响应的 token 用量推算订阅剩余量。
4. **Host Remote**：查询状态、发起/取消授权、提交需要人工回填的回答、退出、读取/刷新额度，以及以后可能加入的 reset 卡确认操作。尝试 ID 绑定本次操作，不向其他尝试的页面投递授权码或 token。

Client 只拥有设置页展示状态、焦点/弹窗和取消动作；Host 拥有登录是否完成、token、模型路由可用性和额度事实。所有产品可见文本经插件自己的中英文 locale 字典提供。页面关闭、断线、插件禁用都应终止未完成的交互并收尾 Host 资源；两次并发登录同一记录必须明确拒绝或复用唯一尝试，而非并行写入。

## 4. 登录、模型和退出流程

### 4.1 启动与未登录

Bundle 装载后页面可见，即使没有 Codex 凭据也能点击登录。Host 读取插件自有记录并检查其可用性；不因为没有 token 而让 Client 插件或整个 Bundle 无法启动。`LlmAdapter` 的**初始注册不能使用空路由数组**：首次验证登录成功后注册 `codex-subscription`；登出时使用该注册句柄的 `replace([])` 撤销路由。重启后已有有效凭据时恢复路由。过期或授权失败不能把“没有 `apiKeyEnv`”误报为可用模型。

### 4.2 浏览器授权

1. Client 调用插件 Remote 开始登录；Host 在授权服务注册的插件专属流程上执行 `begin()`，生成尝试 ID 并向该页面传递必要的通知与提示。
2. pi-ai 的 Codex OAuth 流生成 ChatGPT 授权 URL；Client 只允许打开经过 Host 流程提供的 HTTPS 授权 URL，另提供复制链接。不要在 UI、Session、日志或错误中保存授权码、完整回调 URL、access token 或 refresh token。
3. 同机浏览器通过 Host 侧 loopback callback 完成授权；Host 验证 OAuth state/PKCE 并在一次受控写入中提交凭据。远程 Web 浏览器无法回调 Host 的 localhost 时，按 pi-ai 实际提供的 device-code 或手动验证码路径显示提示。验证这一路径前，不将其宣称为可用。
4. Host 返回已登录状态并触发模型目录更新，选择器出现经过当前账号验证的模型；用户选择后执行一轮含工具调用、取消和后续请求的真实对话。

授权尝试须覆盖取消、超时、断线、回调先于页面刷新、重复通知及插件卸载。撤销中的提交和 token 轮换要以 Host 凭据服务的原子操作为准；失败仍保留上一次有效登录，不覆盖为半写入状态。

### 4.3 模型调用

插件优先使用 pi-ai 公开的 Codex provider 处理 OAuth 刷新和 Codex 请求协议，自己只承担 DSH `LlmAdapter` 的必要转换。`listModels()` 只公布当前账号可以使用且转换器确实支持的模型；`resolveModel()` 报告上下文、输入类型和推理档位时以已验证目录为准。`prepareCall()` 绑定目录与实际请求使用的同一代适配器状态，避免登录或配置变化让模型元数据与请求目标不一致。

`stream()` 必须遵守 DSH `StreamChunk` 规则：usage 在 finish 前、finish 后不再发块；工具参数保留原始 JSON；取消传播到提供商流；提供商错误作为终止结果；请求附带 DSH 所要求的归因标头。图像或 provider-native replay 如不能在首版正确实现，必须声明为不支持并拒绝，不因目录宣称能力而悄悄降级。模型请求不可借 `OPENAI_API_KEY` 或原有 `llm-pi-ai` 账户回退，以免误用另一计费身份。

### 4.4 退出与禁用

退出只删除插件自有 OAuth 记录；撤销后续 Codex 路由并通知选择器，不删除原 API Key、Codex CLI 凭据、其它插件凭据或会话历史。进行中的模型请求和退出的先后策略须在实现前定为明确的取消或完成规则，并通过竞态测试验证。禁用 Bundle 撤销 Remote、UI slot、监听器和路由；存储凭据是否保留供再次启用由产品设置明确说明，默认不以“停用”暗中注销。

## 5. 额度数据：必须先验证的决定

**已知缺口：** `LlmAdapter` 的 `TokenUsage` 是单次请求计数，不含账户套餐、五小时或每周窗口、reset 卡。不能通过扩充 `TokenUsage` 假造账户额度接口，也不能复用 DeepSeek 账户余额 Remote。

从同一 pi-ai OAuth 登录态直接读取 ChatGPT 的 Codex 用量，生态插件 [dsh-plugin-subscriptions](https://github.com/V1ki/dsh-plugin-subscriptions)采用 `chatgpt.com/backend-api/wham/usage`。此端点的兼容性不属于 DSH `LlmAdapter` 保证，也不是本计划确认的稳定公开额度 API。OpenAI [Codex App Server 文档](https://developers.openai.com/codex/app-server#authentication-and-account-apis)提供 `account/rateLimits/read`、`account/rateLimits/updated` 和 `account/rateLimitResetCredit/consume`，但 App Server 自行托管 `chatgpt` 登录；外部 token 注入模式 `chatgptAuthTokens` 被标为实验性。**不得声称 pi-ai 登录可以无损复用于 App Server。**

第一步做可丢弃的 Host 端验证：使用测试账号在明确授权后完成一次 pi-ai 登录、模型请求和额度读取，记录是否确为同一账户、额度响应字段、权限限制、刷新后的行为以及是否返回 reset 卡。先使用模拟响应构造解析测试；真实接口只在用户提供自己的密钥/授权并同意请求时验证，不把真实 token 或响应提交进仓库。

验证后按事实选择一条线路：

- **线路 A（首选最小实现）**：同一 OAuth 凭据可读取账户额度。仅在插件的额度模块内调用该端点并限制请求、解析和错误影响范围；模型请求继续通过 pi-ai。明确告知用户这是可能随服务端变化而失效的额度来源。
- **线路 B（公开 App Server 能力优先）**：若必须只依赖文档化的 `account/rateLimits/read`，先验证能否让 App Server 自己完成登录，并让同一登录态可靠支持 DSH 主模型的 `LlmAdapter` 请求。若不能，不能隐式要求用户登录两次或依赖实验性 token 模式；在产品范围决定前暂停额度交付。
- **两条线路都失败**：登录与模型适配可以继续独立验证，但“完整的订阅额度页”未达验收，不以伪造百分比或只展示一次请求 token 用量冒充完成。

Host → Client 的最小额度视图建议为：`fetchedAt`、可选 `plan`、若干 `{ limitId, label?, windows: [{ durationMins?, usedPercent?, resetsAt? }] }`，以及单独的 reset 卡可用数与可选详情。解析按**字段存在性**处理：未报告的 `secondary`、重置时间、额度组和 reset 卡均为未知或不展示，不等于零。窗口标签从返回的持续时长推导；只有确实返回 300 分钟的窗口才显示“五小时”，每周同理。套餐（包括 Pro）只是服务端给的展示事实，不能决定应该出现哪些窗口。

首次交付先实现额度的读取、手动刷新和错误状态；如使用 reset 卡被纳入该版本，还需要证明同一登录态能调用服务端认可的消费接口、获取服务端颁发的卡 ID、一次性 idempotency key 及消费后重读结果。UI 必须二次确认，禁止自动消费、失败后盲目重试或根据本地计算宣布成功。仅能读取而无法安全消费时，页面保持只读，不显示无效按钮。

## 6. 分阶段交付及每阶段验收

### 阶段 0：兼容性与账户实验

- 锁定一组 DSH、Cordis、pi-ai 和 Codex 版本；验证插件单独安装所需的 peer 范围，检查 Web 和 Desktop profile 的包解析与预检行为。
- 用一次明确授权的真实测试证明官方 ChatGPT 浏览器登录、持久化后的模型调用，以及同凭据额度读取是否成立；核对是否有安全可用的远程浏览器后备。失败时保存脱敏诊断，不进入“额度已完成”阶段。
- 验证官方 `llm-pi-ai` 即使同时安装，也不会与插件的路由或凭据键冲突；模拟无插件、已禁用和插件导入失败时的默认启动。

### 阶段 1：可使用的模型订阅插件

- 交付一个包含 Host 与 Client 的 Bundle，以及设置入口、登录/取消/退出、凭据和独立 Codex `LlmAdapter`。
- 通过真实 Loader/profile 组合测试注册和卸载，而非只手工 `ctx.plugin()`；测试登录失败、授权取消、token 刷新、跨进程重新启动、没有 API Key、路由冲突和禁用后的 UI/Remote/路由撤销。
- 通过一次真实 Codex 对话验证文本、工具调用、续轮、取消和归因；不支持的内容必须明确拒绝。未取得账户或权限时，真实 API 用例明确跳过，不能以 mock 通过宣称真实授权成功。

### 阶段 2：额度与重置状态

- 根据阶段 0 的额度来源决定实现只读查询，展示服务端实际额度组、五小时/每周（存在时）、已用比例、重置时间、套餐及查询时间。
- 模拟 Plus、Pro、没有五小时窗口、多额度组、`null`、缺失字段、过期时间、429、401、离线和返回结构改变；失败保留上次有效显示但标注过期，且不能影响模型调用。
- 如服务端支持同登录态 reset 卡查询，显示可用数及返回的详情；使用能力另以“明确确认 + 服务端结果 + 刷新”通过后才上线。

### 阶段 3：发行与双端验收

- 用**构建后的发布包**而不只是源码运行 Web；独立在官方 Desktop 的 Plugins 页面安装到 Desktop profile，验证系统浏览器授权、回调/手动后备、重启、退出、禁用、卸载。
- UI 验证中英文、深浅色、窄窗口、窗口标题栏避让、键盘取消、断线重连及额度错误。任何产品用户可见的 GUI 变更提供实际插件服务器与真实流程的录屏/GIF 证据。
- 发布包不含凭据、测试回调、固定本机路径或构建期私有值；README 只写实测过的支持版本和操作，明确未验证平台及额度接口的稳定性限制。

## 7. 退出条件与不做的事

只有当目标版本完成真实授权、模型请求、额度事实验证和 Web/Desktop 组合验收，才称其为“可用的完整 Codex 订阅插件”。若配额 API 不可靠，保留模型接入与额度卡的独立失败状态，但发布说明必须如实标记额度能力未达标。

首版不修改 DSH 核心循环、官方模型编辑器、DeepSeek 账户页或 Desktop 原生授权代码；不代理 OpenAI API Key 账单，不推断订阅付款记录，不自动使用 reset 卡，不读取其他应用的可轮换登录文件，也不为不确定的服务端字段预置虚假的额度百分比。
