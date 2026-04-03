import AiBot, { type WSClient, type WsFrame, type BaseMessage, type TextMessage } from '@wecom/aibot-node-sdk'
import type { BridgeConfig } from './types.js'
import { ClaudeClient } from './claude-client.js'
import { SessionManager } from './session-manager.js'
import { MessageProcessor } from './message-processor.js'
import { ResponseSender } from './response-sender.js'
import { parseCommand, getHelpText } from './command-parser.js'
import { log, createFilteredLogger } from './logger.js'

export class Bridge {
  private config: BridgeConfig
  private ws: WSClient
  private claude: ClaudeClient
  private sessions: SessionManager
  private processor: MessageProcessor
  private abortControllers: Map<string, AbortController> = new Map()
  // In-memory processing flag to prevent race conditions (TOCTOU-safe)
  private processingChats: Set<string> = new Set()

  constructor(config: BridgeConfig) {
    this.config = config
    this.ws = new AiBot.WSClient({
      botId: config.wecom.botId,
      secret: config.wecom.secret,
      logger: createFilteredLogger(),
    })
    this.claude = new ClaudeClient(config.project, config.claude)
    this.sessions = new SessionManager(config.wecom)
    this.processor = new MessageProcessor(this.ws)
  }

  async start(): Promise<void> {
    await this.sessions.init()

    this.setupEventHandlers()

    this.ws.connect()

    log.info('[Bridge] Service started (WebSocket mode)')
    log.info(`[Bridge] Project: ${this.config.project.cwd}`)
    log.info(`[Bridge] Model: ${this.config.project.model}`)
    log.info(`[Bridge] Bot ID: ${this.config.wecom.botId}`)
  }

  async stop(): Promise<void> {
    this.ws.disconnect()
    for (const [, controller] of this.abortControllers) {
      controller.abort()
    }
    this.abortControllers.clear()
    await this.sessions.destroy()
    log.info('[Bridge] Service stopped')
  }

  private setupEventHandlers(): void {
    this.ws.on('authenticated', () => {
      log.info('[Bridge] WebSocket authenticated')
    })

    this.ws.on('connected', () => {
      log.info('[Bridge] WebSocket connected')
    })

    this.ws.on('disconnected', (reason) => {
      log.info(`[Bridge] WebSocket disconnected: ${reason}`)
    })

    this.ws.on('reconnecting', (attempt) => {
      log.info(`[Bridge] WebSocket reconnecting... attempt ${attempt}`)
    })

    this.ws.on('error', (error) => {
      log.error(`[Bridge] WebSocket error: ${error.message}`)
    })

    // Handle text messages
    this.ws.on('message.text', (frame) => {
      this.handleMessage(frame).catch((error) => {
        const msg = error instanceof Error ? error.message : String(error)
        log.error(`[Bridge] Handle text message error: ${msg}`)
      })
    })

    // Handle image messages
    this.ws.on('message.image', (frame) => {
      this.handleMessage(frame).catch((error) => {
        const msg = error instanceof Error ? error.message : String(error)
        log.error(`[Bridge] Handle image message error: ${msg}`)
      })
    })

    // Handle file messages
    this.ws.on('message.file', (frame) => {
      this.handleMessage(frame).catch((error) => {
        const msg = error instanceof Error ? error.message : String(error)
        log.error(`[Bridge] Handle file message error: ${msg}`)
      })
    })

    // Handle voice messages (SDK auto-transcribes)
    this.ws.on('message.voice', (frame) => {
      this.handleMessage(frame).catch((error) => {
        const msg = error instanceof Error ? error.message : String(error)
        log.error(`[Bridge] Handle voice message error: ${msg}`)
      })
    })

    // Welcome message on enter_chat
    this.ws.on('event.enter_chat', (frame) => {
      this.ws.replyWelcome(frame, {
        msgtype: 'text',
        text: { content: '你好！我是 Claude Code 助手，发送消息即可开始对话。\n\n发送 /help 查看可用命令。' },
      }).catch((error) => {
        log.error('[Bridge] Send welcome error:', error)
      })
    })
  }

  private async handleMessage(frame: WsFrame<BaseMessage>): Promise<void> {
    const body = frame.body!
    const chatId = body.chattype === 'group' ? (body.chatid ?? body.from.userid) : body.from.userid
    const userId = body.from.userid

    // Log incoming message
    log.info(`收到消息 (${userId}, ${body.chattype}): [${body.msgtype}] ${this.extractMessageSummary(body)}`)

    if (body.msgtype === 'text') {
      const textBody = body as unknown as TextMessage
      const textContent = textBody.text?.content ?? ''
      const parsed = parseCommand(textContent)
      if (parsed.isCommand && parsed.command) {
        await this.handleCommand(frame, chatId, parsed.command)
        return
      }
    }

    // Skip if currently processing (in-memory check — TOCTOU-safe via Set)
    if (this.processingChats.has(chatId)) {
      const sender = new ResponseSender(this.ws, frame, false, chatId)
      await sender.sendText('正在处理上一条消息，请稍候...')
      return
    }

    // Mark as processing atomically
    this.processingChats.add(chatId)
    await this.sessions.updateSession(chatId, {
      lastActiveTime: new Date().toISOString(),
    })

    const sender = new ResponseSender(this.ws, frame, this.config.bridge.showStats ?? false, chatId)

    try {
      // Process the message
      const processed = await this.processor.process(frame)

      if (processed.type === 'unsupported') {
        await sender.sendText(processed.content)
        return
      }

      // Get or create session
      const existingMapping = this.sessions.getSession(chatId)
      const sessionId = existingMapping?.sessionId ?? null

      // Build prompt
      const prompt = this.processor.buildPrompt(processed)

      // Create abort controller
      const abortController = new AbortController()
      this.abortControllers.set(chatId, abortController)

      // Call Claude
      const result = await this.claude.sendMessage(
        prompt,
        sessionId,
        {
          onText: (text) => sender.append(text),
          onToolUse: (toolName) => {
            log.info(`[Bridge] Tool use: ${toolName}`)
          },
        },
        abortController.signal,
      )

      // Clean up abort controller
      this.abortControllers.delete(chatId)

      // Send final response
      if (result.isError) {
        await sender.sendError(result.errorMessage ?? 'Unknown error')
      } else {
        await sender.sendFinal({
          cost: result.totalCostUsd,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        })
      }

      // Update session mapping
      if (result.sessionId) {
        if (!existingMapping) {
          await this.sessions.createSession(chatId, result.sessionId)
        } else {
          const current = this.sessions.getSession(chatId)
          if (current) {
            await this.sessions.updateSession(chatId, {
              sessionId: result.sessionId,
              totalInputTokens: current.totalInputTokens + result.inputTokens,
              totalOutputTokens: current.totalOutputTokens + result.outputTokens,
              totalCostUsd: current.totalCostUsd + result.totalCostUsd,
            })
          }
        }
      }

      await this.sessions.updateSession(chatId, {
        lastActiveTime: new Date().toISOString(),
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      log.error(`[Bridge] Handle error: ${msg}`)
      await sender.sendError(msg)
    } finally {
      this.processingChats.delete(chatId)
    }
  }

  private async handleCommand(frame: WsFrame<BaseMessage>, chatId: string, command: string): Promise<void> {
    const sender = new ResponseSender(this.ws, frame)

    switch (command) {
      case 'reset':
        await this.sessions.resetSession(chatId)
        await sender.sendText('会话已重置，开始新对话')
        break

      case 'status': {
        const mapping = this.sessions.getSession(chatId)
        if (!mapping) {
          await sender.sendText('当前无活跃会话')
        } else {
          const status = [
            '== 会话状态 ==',
            `Session: ${mapping.sessionId.slice(0, 8)}...`,
            `最后活跃: ${mapping.lastActiveTime}`,
            `Token: ${mapping.totalInputTokens}in/${mapping.totalOutputTokens}out`,
            `费用: $${mapping.totalCostUsd.toFixed(4)}`,
          ].join('\n')
          await sender.sendText(status)
        }
        break
      }

      case 'stop': {
        const controller = this.abortControllers.get(chatId)
        if (controller) {
          controller.abort()
          this.abortControllers.delete(chatId)
          await sender.sendText('已中断当前任务')
        } else {
          await sender.sendText('当前没有正在执行的任务')
        }
        break
      }

      case 'help':
        await sender.sendText(getHelpText())
        break
    }
  }

  private extractMessageSummary(body: BaseMessage): string {
    switch (body.msgtype) {
      case 'text': {
        const textBody = body as unknown as TextMessage
        return textBody.text?.content ?? ''
      }
      case 'image':
        return '[图片]'
      case 'file':
        return '[文件]'
      case 'voice':
        return '[语音]'
      case 'video':
        return '[视频]'
      default:
        return `[${body.msgtype}]`
    }
  }
}
