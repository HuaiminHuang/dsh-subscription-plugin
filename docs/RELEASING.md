# 发布说明（维护者）

当前版本为 `0.1.1`，面向 DSH `0.2.0-rc.2` 的兼容性发行版，发行范围限定为 Ubuntu / Web。上一个正式 tarball 为 `0.1.0`，支持范围限定为旧基线中的 Ubuntu / Web。版本标签不代表 Desktop 或全部账号能力已验收；每版的验证范围与实验能力必须单独记录。`private: true` 保留，用于阻止意外发布到 npm registry，不影响 `npm pack` 或 GitHub Release 附件。GitHub 源码 ZIP/TAR 不含构建产物，不是可安装 Bundle。

历史预发布说明见 [v0.0.2](RELEASE_NOTES_v0.0.2.md)，历史正式版说明见 [v0.1.0](RELEASE_NOTES_v0.1.0.md)，当前版说明见 [v0.1.1](RELEASE_NOTES_v0.1.1.md)。

## 发布前

1. 验证登录生命周期、目标 DSH 的真实 Loader 组合、构建包安装与卸载。真实账号授权、模型调用和 Desktop 分别记录；未运行的检查不得写成已通过。没有验证的平台和能力不纳入正式版支持承诺。
2. 核对 DSH `639ed015397290b3745d163aafe02ffee4aa3f84`（`0.2.0-rc.2`） 与固定 pi-ai 补丁。优先使用干净检出；若沿用本机参考检出，按兼容性基线审查并记录差异，不能重置用户工作。仅 Desktop 构建差异不得据此声明 Desktop 兼容。
3. 同步 `package.json`、AGENTS.md、中英文 README、发布说明和附件文件名。检查 MIT LICENSE、目录与 tarball 内容，排除凭据、OAuth 回调、本机 profile 数据和诊断私有产物。

## 构建与保存

使用本仓库实际定义的 `pnpm typecheck`、`pnpm test`、`pnpm test:package`，执行 `npm pack --dry-run` 和 `git diff --check`。新安装依赖时使用 `pnpm install --frozen-lockfile --ignore-scripts`，不要为已有环境隐式升级依赖。

正式产物必须从独立源码快照全新构建，不能依赖旧 `lib/` 的残留共享模块。运行 `npm pack`，保存 `h2mzzz-dsh-openai-subscription-<版本>.tgz` 与 `SHA256SUMS`。将该 tarball 放入隔离 Loader 测试环境，检查挂载、独立开关、模型路由/Remote/工具/Skill/读取路由撤销；Client 的槽位注册与撤销另外检查。

提交版本变更，仅为该提交建立附注 tag `v<版本>`。本地保存与远端发布是两步：没有推送时不得声称 GitHub Release 已上线。用户要求远端发布后，再推送提交和 tag，为正式版创建普通 Release，上传 tarball、校验文件和发布说明；候选版使用 Pre-release。发布说明必须包含精确 DSH/pi-ai 版本、已验证平台与仍未验证的能力。

用户安装构建后的 `.tgz`，不用 Git 地址或自动生成的源码压缩包。不在发布脚本、日志和附件中包含访问令牌；使用维护者已有的 GitHub 授权，不要求在聊天中提供 token。
