import type { ParsedCommand, CommandType } from './types.js'

const COMMAND_MAP: Record<string, CommandType> = {
  '/reset': 'reset',
  '/status': 'status',
  '/stop': 'stop',
  '/help': 'help',
}

export function parseCommand(text: string): ParsedCommand {
  const trimmed = text.trim().toLowerCase()

  for (const [prefix, command] of Object.entries(COMMAND_MAP)) {
    if (trimmed === prefix || trimmed.startsWith(prefix + ' ')) {
      const args = trimmed.slice(prefix.length).trim()
      return { isCommand: true, command, args: args || undefined }
    }
  }

  return { isCommand: false }
}

export function getHelpText(): string {
  return [
    '== Claude Code Bridge ==',
    '',
    '直接发送消息与 Claude Code 对话',
    '',
    '命令:',
    '/reset - 重置会话，开始新对话',
    '/status - 查看当前会话状态',
    '/stop - 中断当前任务',
    '/help - 显示此帮助',
  ].join('\n')
}
