# GitHub prepare 安装验证

验证日期：2026-10-02。构建提交：`15514d75dc3c4689919a6c0eccb034258bbc6bbe`。
目标：DSH `0.2.0-rc.2`，Node `26.8.2`，pnpm `11.7.0`。

## 隔离与方法

先用不含 `lib/`、`node_modules/` 或相邻 DSH 源码的临时 Git 仓库验证；再创建新的临时 `DSH_HOME`、空 Web profile 和独立 pnpm store，使用 DSH 的 `plugin --profile web add` 安装实际 GitHub 提交：

```sh
DSH_HOME=/absolute/path/to/isolated-home dsh plugin --profile web add \
  https://github.com/HuaiminHuang/dsh-subscription-plugin#15514d75dc3c4689919a6c0eccb034258bbc6bbe
```

CLI 运行器使用本机固定基线 DSH；插件构建只从 registry 获取已声明依赖，不引用该 DSH 源码。未修改用户现有 profile 或 Web 服务。

## 结果

- 不允许 prepare 的负对照返回 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`；仅允许包名也不足以通过 pnpm 11.7 的 Git 构建检查。
- 按诊断将完整来源及提交键写入隔离 profile 的 `allowBuilds`，明确拒绝 `@google/genai`、`protobufjs` 的安装脚本后，安装退出码为 0。
- pnpm 实际获取 GitHub codeload 源码并自动执行 `prepare`，日志包含 TypeScript 声明生成、Host 与 Client 的 tsdown 构建完成。没有复制本地 `lib/`。
- Git/SSH 与 GitHub codeload 来源可能分别要求许可键；保留已有条目，补充实际诊断中的新键。
- 已安装包的所有非通配 exports 路径存在，包括三个 Host 入口、Client、Typert 和类型声明。
- `pnpm test:profile <隔离 DSH_HOME>` 使用公开 DSH 包的真实 Loader、ToolRuntime、SkillRegistry，验证挂载、持久化组件开关、文本路由保留和卸载撤销。脚本最终恢复 profile patch。
- 独立 registry 依赖下 `pnpm typecheck`、`pnpm test`（20 文件 / 100 测试）、`pnpm test:package`、`npm pack --dry-run`、`git diff --check` 全部通过。包检查另验证真实已发布 Client factory 的槽位及 Remote 注册/撤销。

本记录证明 GitHub 来源的安装及 Loader 生命周期；认证、网络、存储为合成测试依赖，未验证完整 Web 页面、Desktop、真实账号登录/模型调用。没有发布 npm，也没有修改旧 `v0.1.1` 标签。
