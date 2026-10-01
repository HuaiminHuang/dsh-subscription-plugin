# v0.1.0 — 首个正式版本

`@h2mzzz/dsh-openai-subscription@0.1.0`，独立、可选的 DSH Bundle。正式发行范围为固定 DSH 基线的 Ubuntu / Web 使用；Desktop、订阅额度与 reset 卡不在支持范围。保留 `private: true`，以构建后的 tarball 分发，不发布 npm registry。

## 本版功能

- 插件自有 OAuth 登录、凭据记录和 `codex-subscription` 路由，保留历史凭据键，不替换 DSH 官方 OpenAI 提供商。
- 动态发现账号可见模型和思考档位，过滤内部条目；设置页可刷新，失败时保留现有目录。
- 独立启停的紧凑模型滑块，支持各模型原有思考档位；同一弹层内选择型号，收起时展示型号与强度。
- 按会话和型号选择快速模式，与思考强度独立；选中后显示实心闪电，实际账号权限由服务端决定。
- 独立生图工具、随包 Skill 和会话图片卡片，支持复合 call ID；该能力仍为实验功能。
- 按模型目录的 `image` 字段声明图片输入，通过 DSH 附件服务转换用户和工具返回的图片，包含预览预算、历史卸载占位与取消处理。原生识图仍为实验功能，尚未完成真实账号验收。

## 兼容性与验证

- DSH `0.1.7-rc.2`，提交 `477b4f420553e8a52c2fbccc464d7561b239c443`；固定的已打补丁 `@earendil-works/pi-ai@0.85.1`。
- Ubuntu：类型检查、20 个测试文件 / 100 个用例、全新构建后的包检查与 tarball 清单检查。
- 通过 DSH CLI 将正式 tarball 安装到临时 Web profile，使用实际 profile 模块解析、Loader、ToolRuntime 和 SkillRegistry 检查挂载、独立条目启停与卸载；认证、网络、存储使用合成测试依赖，不代表真实账号请求通过。
- 构建包 Client 检查包含实际 Remote 命名空间注入、设置/工具/模型槽位撤销、模型选择页、快速模式、滑块 DOM 保留与目录刷新状态。
- 当前 Web 界面的模型控件曾在真实浏览器验证；没有完成覆盖全部窄窗口、深浅色、断线重连和 Desktop 窗口的验收矩阵。

本机参考 DSH 检出位于上述固定提交，尚有五个 Desktop 构建相关文件的未提交修改；本版不更改这些文件，不使用它们声明 Desktop 支持。Host 核心路径没有跟踪文件差异。精确基线见 [COMPATIBILITY_BASELINE.md](COMPATIBILITY_BASELINE.md)。

## 安装与限制

安装构建后的 `h2mzzz-dsh-openai-subscription-0.1.0.tgz`，不要使用源码 ZIP/TAR：

```sh
dsh plugin --profile web add /absolute/path/to/h2mzzz-dsh-openai-subscription-0.1.0.tgz
```

从 `0.0.2` 更新会替换同一个 scoped 包，保留插件历史凭据键。Host 代码更新后需重新加载插件或重启 DSH；仅刷新网页不能保证后端更新。旧 unscoped 包与本包不能同时启用。

本版不保证所有账号都能使用列表中的每个模型或快速模式。设备代码登录、真实账号识图及完整授权/刷新/工具调用流程没有在本次发行检查中重新验收。不支持 deferred tools、stop sequences 和 system/assistant/developer 消息中的图片。生产使用按上述范围评估，实验能力与未验证平台不作完成承诺。
