// ===== 配置类型 =====
export interface BridgeConfig {
  project: ProjectConfig
  wecom: WecomConfig
  claude: ClaudeConfig
  bridge: BridgeServerConfig
}

export interface ProjectConfig {
  cwd: string
  model: string
  allowedTools: string[]
}

export interface WecomConfig {
  botId: string
  secret: string
  sessionTimeoutMin: number
}

export interface ClaudeConfig {
  maxTurns: number
  maxBudgetUsd: number
}

export interface BridgeServerConfig {
  showStats?: boolean
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'silent'
}

// ===== 会话映射 =====
export interface SessionMapping {
  chatId: string
  sessionId: string
  lastActiveTime: string
  isProcessing: boolean
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
}

// ===== 命令 =====
export type CommandType = 'reset' | 'status' | 'stop' | 'help'

export interface ParsedCommand {
  isCommand: boolean
  command?: CommandType
  args?: string
}
