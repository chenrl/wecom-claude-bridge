import { query, type SDKMessage, type Options } from '@anthropic-ai/claude-agent-sdk'
import type { ProjectConfig, ClaudeConfig } from './types.js'

export interface ClaudeResponse {
  text: string
  sessionId: string
  totalCostUsd: number
  inputTokens: number
  outputTokens: number
  isError: boolean
  errorMessage?: string
}

export interface ClaudeMessageHandler {
  onText: (text: string) => void
  onToolUse?: (toolName: string, input: unknown) => void
}

export class ClaudeClient {
  private projectConfig: ProjectConfig
  private claudeConfig: ClaudeConfig

  constructor(projectConfig: ProjectConfig, claudeConfig: ClaudeConfig) {
    this.projectConfig = projectConfig
    this.claudeConfig = claudeConfig
  }

  async sendMessage(
    prompt: string,
    sessionId: string | null,
    handler: ClaudeMessageHandler,
    abortSignal?: AbortSignal
  ): Promise<ClaudeResponse> {
    let fullText = ''
    let capturedSessionId = ''
    let totalCost = 0
    let inputTokens = 0
    let outputTokens = 0

    try {
      const options: Options = {
        model: this.projectConfig.model,
        cwd: this.projectConfig.cwd,
        allowedTools: this.projectConfig.allowedTools,
        maxTurns: this.claudeConfig.maxTurns,
        maxBudgetUsd: this.claudeConfig.maxBudgetUsd,
        permissionMode: 'acceptEdits',
        persistSession: true,
      }

      if (sessionId) {
        options.resume = sessionId
      }

      if (abortSignal) {
        options.abortController = new AbortController()
        abortSignal.addEventListener('abort', () => {
          options.abortController?.abort()
        })
      }

      const messageStream = query({ prompt, options })

      for await (const message of messageStream) {
        this.processMessage(message, handler, {
          onSessionId: (id: string) => { capturedSessionId = id },
          onText: (text: string) => { fullText += text },
          onCost: (cost: number) => { totalCost = cost },
          onTokens: (inp: number, out: number) => { inputTokens = inp; outputTokens = out },
          onError: (msg: string) => {
            return {
              text: fullText,
              sessionId: capturedSessionId,
              totalCostUsd: totalCost,
              inputTokens,
              outputTokens,
              isError: true,
              errorMessage: msg,
            }
          },
        })
      }

      return {
        text: fullText,
        sessionId: capturedSessionId,
        totalCostUsd: totalCost,
        inputTokens,
        outputTokens,
        isError: false,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return {
        text: fullText,
        sessionId: capturedSessionId,
        totalCostUsd: totalCost,
        inputTokens,
        outputTokens,
        isError: true,
        errorMessage: msg,
      }
    }
  }

  private processMessage(
    message: SDKMessage,
    handler: ClaudeMessageHandler,
    callbacks: {
      onSessionId: (id: string) => void
      onText: (text: string) => void
      onCost: (cost: number) => void
      onTokens: (inp: number, out: number) => void
      onError: (msg: string) => ClaudeResponse
    }
  ): ClaudeResponse | void {
    // System init message - capture session ID
    if (message.type === 'system' && message.subtype === 'init') {
      callbacks.onSessionId(message.session_id)
      return
    }

    // Assistant message - extract text and tool use
    if (message.type === 'assistant' && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === 'text' && block.text) {
          callbacks.onText(block.text)
          handler.onText(block.text)
        }
        if (block.type === 'tool_use' && handler.onToolUse) {
          handler.onToolUse(block.name, block.input)
        }
      }
      return
    }

    // Result message - success or error
    if (message.type === 'result') {
      callbacks.onSessionId(message.session_id)

      if (message.subtype === 'success') {
        callbacks.onCost(message.total_cost_usd)
        callbacks.onTokens(
          message.usage?.input_tokens ?? 0,
          message.usage?.output_tokens ?? 0
        )
      } else {
        const errorMsg = message.errors?.join('; ') ?? message.subtype
        return callbacks.onError(errorMsg)
      }
    }
  }
}
