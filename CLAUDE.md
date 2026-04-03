# WeChat Work - Claude Code Bridge

企业微信与 Claude Code 的桥接服务，通过企微智能机器人 WebSocket 长连接与 Claude Code 交互。

## 关键命令

- `npm run dev` — 开发模式启动（热重载）
- `npm start` — 生产模式启动
- `npm run build` — TypeScript 编译

## 架构

- `src/index.ts` — 入口：加载配置、启动 Bridge、优雅关闭
- `src/bridge.ts` — 核心编排：WebSocket 事件驱动 → 处理 → 转发 → 流式响应
- `src/claude-client.ts` — Agent SDK 封装（query 调用、流式响应）
- `src/session-manager.ts` — 会话映射持久化（chatid ↔ session_id）
- `src/message-processor.ts` — 消息类型处理（文本/图片/文件/语音）
- `src/response-sender.ts` — WebSocket 流式回复（智能分片）
- `src/command-parser.ts` — 命令解析（/reset, /status, /stop, /help）
- `src/lock.ts` — PID 锁文件（防多实例）

## 依赖

- `@wecom/aibot-node-sdk` — 企微智能机器人官方 SDK（WebSocket 长连接）
- `@anthropic-ai/claude-agent-sdk` — Claude Agent SDK

## 配置

`config.json` 包含：
- `project.cwd` — Claude Code 工作目录
- `project.model` — 模型名称
- `project.allowedTools` — 允许的工具列表
- `wecom.botId` — 机器人 ID（管理后台获取）
- `wecom.secret` — 机器人密钥（管理后台获取）

## 工作流程

1. 建立 WebSocket 长连接（自动认证、心跳、重连）
2. 收到消息后，根据类型处理（文本/图片/文件/语音）
3. 转发给 Claude Agent SDK（保持会话上下文）
4. 流式回复通过 WebSocket 实时推送（非阻塞，支持 Markdown）
5. 更新会话映射和统计信息
