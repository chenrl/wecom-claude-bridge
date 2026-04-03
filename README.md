# WeCom-Claude Bridge

通过企业微信智能机器人连接 Claude Code，在手机上随时随地与 Claude Code 交互。

## 功能特性

- **实时通信** — 基于 WebSocket 长连接，消息即时送达，无需轮询
- **流式回复** — Claude 的回答实时推送到企业微信，支持 Markdown 格式
- **会话保持** — 自动维护 Claude Code 会话上下文，连续对话无需重复说明
- **多消息类型** — 支持文本、图片、文件、语音消息
- **命令系统** — `/reset`、`/status`、`/stop`、`/help`
- **安全防护** — PID 锁防多实例、会话超时自动清理

## 架构

```
企业微信客户端 ←→ 智能机器人 WebSocket ←→ Bridge ←→ Claude Agent SDK
```

```
src/
├── index.ts              # 入口：配置加载、启动、优雅关闭
├── bridge.ts             # 核心编排：WebSocket 事件驱动
├── claude-client.ts      # Claude Agent SDK 封装
├── session-manager.ts    # 会话映射持久化
├── message-processor.ts  # 消息类型处理（文本/图片/文件/语音）
├── response-sender.ts    # WebSocket 流式回复
├── command-parser.ts     # 命令解析
├── lock.ts               # PID 锁文件
└── types.ts              # 类型定义
```

## 快速开始

### 前置条件

- Node.js >= 18
- Claude Code CLI 已安装并授权
- 企业微信管理员权限（配置智能机器人）

### 1. 安装依赖

```bash
npm install
```

### 2. 配置企业微信智能机器人

1. 登录 [企业微信管理后台](https://work.weixin.qq.com/wework_admin/frame)
2. 进入 **应用管理 → 智能机器人**
3. 创建机器人，选择 **API 模式 → 长连接**
4. 记录 `BotID` 和 `Secret`

### 3. 编辑配置文件

复制配置模板并填写：

```bash
cp config.example.json config.json
```

编辑 `config.json`：

```jsonc
{
  "project": {
    "cwd": "/path/to/your/project",    // Claude Code 工作目录
    "model": "GLM-5.1",                 // 模型名称
    "allowedTools": ["Read", "Edit", "Write", "Bash", "Glob", "Grep"]
  },
  "wecom": {
    "botId": "YOUR_BOT_ID",             // 智能机器人 BotID
    "secret": "YOUR_BOT_SECRET",        // 智能机器人 Secret
    "sessionTimeoutMin": 30             // 会话超时（分钟）
  },
  "claude": {
    "maxTurns": 50,                     // 最大对话轮数
    "maxBudgetUsd": 5.0                 // 单次对话预算上限（USD）
  },
  "bridge": {
    "showStats": false                  // 是否显示 Token/费用统计
  }
}
```

### 4. 启动服务

```bash
# 开发模式（热重载）
npm run dev

# 生产模式
npm start

# 编译 TypeScript
npm run build
```

启动成功后会看到：

```
[Bridge] Starting WeCom-Claude Bridge...
[Bridge] WebSocket connected
[Bridge] WebSocket authenticated
[Bridge] Service started (WebSocket mode)
```

## 使用方式

在企业微信中找到你的智能机器人，直接发送消息即可。

### 命令

| 命令 | 说明 |
|------|------|
| `/reset` | 重置会话，开始新对话 |
| `/status` | 查看当前会话状态（Session、Token、费用） |
| `/stop` | 中断当前正在处理的任务 |
| `/help` | 显示帮助信息 |

### 支持的消息类型

| 类型 | 说明 |
|------|------|
| 文本 | 直接发送，支持命令 |
| 图片 | 下载后发送给 Claude |
| 文件 | 下载后发送给 Claude |
| 语音 | 自动转文字后处理 |

## 工作原理

1. 服务启动后通过 WebSocket 连接企业微信智能机器人
2. 用户在企业微信中发送消息 → 企微服务器通过 WebSocket 推送到 Bridge
3. Bridge 处理消息类型，构建 prompt
4. 调用 Claude Agent SDK，保持会话上下文
5. Claude 流式输出 → Bridge 通过 WebSocket 流式推送到企业微信
6. 更新会话映射和统计信息

## 安全说明

- `config.json` 包含敏感凭证（botId、secret），已通过 `.gitignore` 排除
- 服务使用 PID 锁文件防止多实例运行
- 会话超时自动清理，防止资源泄漏
- 不会记录或传输消息内容到第三方

## 技术栈

- **运行时**: Node.js + TypeScript
- **企微 SDK**: [@wecom/aibot-node-sdk](https://github.com/WecomTeam/aibot-node-sdk)
- **AI SDK**: [@anthropic-ai/claude-agent-sdk](https://github.com/anthropics/claude-agent-sdk)
- **传输协议**: WebSocket (WSS)
