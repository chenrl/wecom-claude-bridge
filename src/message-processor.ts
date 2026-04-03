import type { WSClient, WsFrame, BaseMessage, TextMessage, ImageMessage, FileMessage, VoiceMessage } from '@wecom/aibot-node-sdk'
import { log } from './logger.js'

export interface ProcessedWsMessage {
  chatId: string
  userId: string
  type: 'text' | 'image' | 'file' | 'voice' | 'unsupported'
  content: string
  imageBuffer?: Buffer
  fileBuffer?: Buffer
  fileName?: string
}

export class MessageProcessor {
  private ws: WSClient

  constructor(ws: WSClient) {
    this.ws = ws
  }

  async process(frame: WsFrame<BaseMessage>): Promise<ProcessedWsMessage> {
    const body = frame.body!
    const chatId = body.chattype === 'group' ? (body.chatid ?? body.from.userid) : body.from.userid
    const userId = body.from.userid

    switch (body.msgtype) {
      case 'text': {
        const textBody = body as unknown as TextMessage
        return {
          chatId,
          userId,
          type: 'text',
          content: textBody.text?.content ?? '',
        }
      }

      case 'image': {
        const imgBody = body as unknown as ImageMessage
        const imageBuffer = await this.downloadImage(imgBody)
        return {
          chatId,
          userId,
          type: 'image',
          content: '[用户发送了一张图片]',
          imageBuffer,
        }
      }

      case 'file': {
        const fileBody = body as unknown as FileMessage
        const result = await this.downloadFile(fileBody)
        return {
          chatId,
          userId,
          type: 'file',
          content: `[用户发送了文件: ${result.fileName}]`,
          fileBuffer: result.buffer,
          fileName: result.fileName,
        }
      }

      case 'voice': {
        const voiceBody = body as unknown as VoiceMessage
        return {
          chatId,
          userId,
          type: 'text',
          content: voiceBody.voice?.content ?? '',
        }
      }

      default:
        return {
          chatId,
          userId,
          type: 'unsupported',
          content: `不支持的消息类型: ${body.msgtype}`,
        }
    }
  }

  buildPrompt(processed: ProcessedWsMessage): string {
    if (processed.type === 'text') {
      return processed.content
    }

    if (processed.type === 'image') {
      return `${processed.content}\n\n(注: 图片消息支持需要后续完善)`
    }

    if (processed.type === 'file') {
      return processed.content
    }

    return processed.content
  }

  private async downloadImage(imgBody: ImageMessage): Promise<Buffer | undefined> {
    if (!imgBody.image?.url) return undefined
    try {
      const { buffer } = await this.ws.downloadFile(imgBody.image.url, imgBody.image.aeskey)
      return buffer
    } catch (error) {
      log.error('[Processor] Download image failed:', error)
      return undefined
    }
  }

  private async downloadFile(fileBody: FileMessage): Promise<{ buffer: Buffer; fileName?: string }> {
    if (!fileBody.file?.url) {
      return { buffer: Buffer.alloc(0) }
    }
    try {
      const result = await this.ws.downloadFile(fileBody.file.url, fileBody.file.aeskey)
      return { buffer: result.buffer, fileName: result.filename }
    } catch (error) {
      log.error('[Processor] Download file failed:', error)
      return { buffer: Buffer.alloc(0) }
    }
  }
}
