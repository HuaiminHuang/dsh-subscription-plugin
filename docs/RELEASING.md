# 发布说明（维护者）

本仓库的 `0.0.2` 是 `private` 的开发预发布版，不是 npm 包，也没有完成 Desktop 验收。`private: true` 阻止 npm registry 发布，但不妨碍 `npm pack` 生成可作为 GitHub Release 附件的 `.tgz`。GitHub 源码 ZIP/TAR 不含构建产物，不是可安装 Bundle。具体测试范围见 [v0.0.2 发布说明](RELEASE_NOTES_v0.0.2.md)。

## 发布前

1. 修复和验证已知登录生命周期竞态，完成目标 DSH 的真实 Loader/profile 组合、构建包安装与卸载检查。真实账号授权、模型和 Desktop 测试分别记录，未运行的检查不得写成已通过；仅在 Ubuntu 完成检查时将候选版标记为 **Pre-release / Ubuntu 已验证范围**，不宣称 Windows、macOS 或完整 Desktop 支持。
2. 使用锁定提交 `477b4f420553e8a52c2fbccc464d7561b239c443` 的**干净** DSH 检出，在其中按 DSH 构建流程准备本包链接依赖所需的产物；不要重置本机 DSH 检出中的未提交修改。核对 [兼容性基线](COMPATIBILITY_BASELINE.md)的目标 pi-ai 补丁。
3. 预发布候选版使用 `0.0.2`；同步核对 `package.json`、中英文 README 安装文件名及兼容说明。确认 `license: MIT` 对应的 LICENSE 文件已包含在包内，检查仓库和打包内容没有凭据、真实 OAuth 回调或本机私有数据。

## 打包与上传

在确认目标 DSH 依赖已构建后，运行 `pnpm install --frozen-lockfile --ignore-scripts`、`pnpm typecheck`、`pnpm test`、`pnpm test:package`、`git diff --check`，再运行 `npm pack`。核对产物 `h2mzzz-dsh-openai-subscription-<版本>.tgz` 的文件清单和 `sha256sum`。

将版本修改与测试一同提交，只为该提交建立并推送 `v<版本>` tag。在 GitHub Releases 中为这个 tag 创建 **Pre-release**，上传已构建的 `.tgz` 并写明 SHA-256、DSH/pi-ai 精确版本、已验证平台与仍未验证的授权/模型/Desktop/额度能力。源码 tag、包内版本和附件文件名须对应。用户在 Desktop「添加插件」或 Web `dsh plugin --profile web add` 中使用这个附件的 HTTPS `.tgz` URL，而不是 Git 仓库地址或自动生成的源码压缩包。

不在发布脚本、日志或 Release 附件中包含访问令牌。创建 Release 可以使用 GitHub 网站，或在维护者已自行登录的环境中使用 `gh`；无需在聊天中提供个人 token。
