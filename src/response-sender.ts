import type { WSClient, WsFrameHeaders } from '@wecom/aibot-node-sdk'
import { generateReqId } from '@wecom/aibot-node-sdk'

// SDK limit is 20480 bytes per stream frame; use 19000 to leave margin
const MAX_STREAM_BYTES = 19000

export class ResponseSender {
  private ws: WSClient
  private frame: WsFrameHeaders
  private showStats: boolean
  private chatId: string | null
  private streamId: string
  private buffer = ''

  constructor(ws: WSClient, frame: WsFrameHeaders, showStats = false, chatId?: string) {
    this.ws = ws
    this.frame = frame
    this.showStats = showStats
    this.chatId = chatId ?? null
    this.streamId = generateReqId('stream')
  }

  append(text: string): void {
    this.buffer += text

    // If buffer exceeds chunk limit, flush current stream and start a new one
    if (Buffer.byteLength(this.buffer, 'utf-8') > MAX_STREAM_BYTES) {
      this.flushChunk(false).catch((error) => {
        console.error('[ResponseSender] Flush chunk failed:', error)
      })
    } else {
      // Non-blocking intermediate update
      this.ws.replyStreamNonBlocking(
        this.frame,
        this.streamId,
        this.buffer,
        false,
      ).catch((error) => {
        console.error('[ResponseSender] Stream update failed:', error)
      })
    }
  }

  async sendFinal(stats?: { cost: number; inputTokens: number; outputTokens: number }): Promise<void> {
    // Flush remaining buffer
    if (this.buffer.length > 0) {
      console.info(`[INFO] 回复完成 (${this.buffer.length} 字符): ${this.buffer.slice(0, 500)}`)
      await this.flushChunk(true)
    } else {
      // Send empty finish if nothing buffered
      await this.ws.replyStream(this.frame, this.streamId, '', true)
    }

    // Send stats as a separate proactive message if enabled
    if (this.showStats && stats && this.chatId) {
      const summary = [
        '---',
        `Token: ${stats.inputTokens}in/${stats.outputTokens}out`,
        `Cost: $${stats.cost.toFixed(4)}`,
      ].join('\n')

      await this.ws.sendMessage(this.chatId, {
        msgtype: 'markdown',
        markdown: { content: summary },
      })
    }
  }

  async sendError(error: string): Promise<void> {
    this.buffer = ''
    console.info(`[INFO] 回复错误: ${error}`)
    await this.ws.replyStream(
      this.frame,
      this.streamId,
      `[Error] ${error}`,
      true,
    )
  }

  async sendText(text: string): Promise<void> {
    console.info(`[INFO] 回复消息: ${text.slice(0, 500)}`)
    await this.ws.replyStream(this.frame, this.streamId, text, true)
  }

  private async flushChunk(finish: boolean): Promise<void> {
    if (this.buffer.length === 0) return

    await this.ws.replyStream(
      this.frame,
      this.streamId,
      this.buffer,
      finish,
    )

    this.buffer = ''

    // If not finishing, start a new stream for the next chunk
    if (!finish) {
      this.streamId = generateReqId('stream')
    }
  }
}
