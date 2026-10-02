# 参考生成验证记录

日期：2026-10-02。目标：DSH `0.2.0-rc.2`，本分支构建的插件 `0.1.1`；尚未发布。

## 真实工具验证

使用临时 `mkdtemp` Web home、随机 loopback 端口和本仓库构建包。原有 Web/desktop profile 未修改；只通过 Host credentials 服务使用已授权的插件专有 grant，不复制或记录凭据。

测试通过 `ctx.agents.create` 创建真实 Agent/Session，将 10 张合成 PNG 保存为 DSH 附件并追加到当前会话的 `user/message`。随后经 DSH `ctx.tools.execute` 分派正式 `codex_generate_image`，传入 10 项 `reference_images`；没有使用临时替代生图工具或直接 HTTP 探针。

- 10 张参考图生成成功，附件为 PNG，1774×887，1,304,930 字节。
- `tool/result` 返回文字与图片元数据；`sessionId` 匹配当前真实会话，附件服务可读回保存的图片。
- 同一环境的 11 张输入返回工具错误；单元测试另行确认错误为数量超限，且发生在授权借用、Session/附件读取和网络请求之前。
- 输出包含两行各五块瓷砖。视觉效果不是服务端最大输入数或每张参考都精确保留的证明。
- 测试 Agent 已显式 dispose，临时 Web 已停止；临时 profile 随后删除。

没有运行模型自动规划工具的完整回合；输入事件与工具调用由 Host 测试插件构造。没有通过浏览器验收上传、卡片预览/下载、断线或重启回放，也没有 Windows/macOS 实机验证。此前生成结果作为 `tool_call_id` 参考的路径有模拟测试，本轮未另发真实请求。

## 自动化验证

`pnpm typecheck`、`pnpm test`（26 个文件、135 项测试）、`pnpm test:package`、`npm pack --dry-run`、`git diff --check` 通过。

新增测试覆盖 10/11 张数量边界、保持输入顺序、空列表保留原生成端点、会话外附件拒绝、成功历史产物归属、失败结果拒绝、50 MB 总量限制、非法选择器、附件失败不降级，以及取消和卸载后的请求屏障与 observation 释放。

10 张是插件产品上限。单张 20 MB、合计 50 MB 是本实现的输入限制，不代表订阅后端公布的限制。
