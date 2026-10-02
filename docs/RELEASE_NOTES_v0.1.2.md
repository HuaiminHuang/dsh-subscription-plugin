# v0.1.2

目标 DSH `0.2.0-rc.2`，提交 `639ed015397290b3745d163aafe02ffee4aa3f84`，及补丁版 `@earendil-works/pi-ai@0.87.1`。不声明 DSH `0.2.0` 正式版或后续版本兼容；发行验证范围仍为 Ubuntu / Web。

- 新增实验性只读订阅限额：设置 → OpenAI 展示五小时、每周剩余比例与重置倒计时，支持手动刷新；模型列表默认折叠，置于限额下方。Host 使用本插件 OAuth 查询真实额度，Client 不接收凭据或账户身份字段。
- 额度请求具有超时、缓存和并发合并；断网保留上次数据，恢复后可重试。退出登录或卸载取消请求并清除缓存，额度失败不影响模型登录。接口 `chatgpt.com/backend-api/wham/usage` 未作为稳定公开 HTTP API 文档化，未来可能变化；不提供重置卡消费。
- 包含此前 main 已合并的独立依赖与 `prepare` 构建，支持 GitHub 地址安装。修复 Windows Skill 路径、图片结果卡片匹配，Skill 注册失败不再连带撤销生图工具；增加会话所属参考图支持、请求/Client 状态职责拆分与三平台 CI 检查。

真实账号已明确授权额度查询；已验证生产额度模块及隔离 DSH Web Host/Remote/Client 页面、手动刷新、断网恢复、深浅色和窄窗口。详细证据及边界见 [订阅额度验证记录](SUBSCRIPTION_USAGE.md)。143 项单元测试、类型检查、构建包、打包内容及隔离 Loader 装卸检查通过；Loader 专项生命周期检查使用合成认证，不冒充真实账号验收。

本次未重新执行 OAuth 登录、令牌刷新、模型/生图调用或 Windows/macOS 真机 Desktop 验收；原生键盘激活尚未可靠验证。Linux Desktop 的 Electron/sharp 问题属于 DSH 宿主，本插件不修改其原生代码。三平台构建测试不代表 Desktop 完整支持。

推荐安装 Git 标签 `github:HuaiminHuang/dsh-subscription-plugin#v0.1.2`，或 Release 中的预构建 `h2mzzz-dsh-openai-subscription-0.1.2.tgz`。Git 安装仍需在目标 profile 中按 pnpm 提示授予准确的构建许可；源码压缩包不等于预构建 Bundle。包继续保留 `private: true`，未发布到 npm registry。
