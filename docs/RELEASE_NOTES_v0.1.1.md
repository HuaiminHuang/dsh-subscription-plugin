# v0.1.1 兼容性发行版

目标 DSH `0.2.0-rc.2`，提交 `639ed015397290b3745d163aafe02ffee4aa3f84`，及其补丁版 pi-ai `0.87.1`。不声明 `0.2.0` 正式版或后续版本兼容。

- 全部 DSH peer 更新为 `0.2.0-rc.2`，插件版本更新为 `0.1.1`；pi-ai peer 与本地开发依赖同步新基线，锁文件移除原独立 pi-ai 依赖树。
- 工具调用参数转换对齐 pi-ai 新 `JsonObject` 类型，保留现有 JSON 对象解析行为；推理档位测试使用新目录中的 `gpt-5.5`，替代已移除的 `gpt-5.4`。
- 构建包检查使用实际 DSH 版本预检，并检查验证时加载的 pi-ai 版本与 peer 声明一致。
- 已通过强制类型检查、20 个测试文件／100 个单元测试、空构建目录的 `test:package`（Host/Client 激活与撤销）、`npm pack --dry-run` 与 `git diff --check`。

新版 tarball 已通过 DSH CLI 在隔离 Web profile 安装，并使用新版实际模块解析、Loader、ToolRuntime 和 SkillRegistry 验证挂载、独立开关与卸载；认证、网络和存储采用合成依赖，不代表真实账号通过。完整浏览器 Client 组合、Desktop、真实账号登录/刷新/模型或图片调用均未运行。Client 平台声明仍为 Web；发行范围限定为 Ubuntu / Web；未修改用户 DSH 安装或启停服务。
