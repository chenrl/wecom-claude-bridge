export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

const LEVEL_NAMES: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
  silent: LogLevel.SILENT,
}

let currentLevel: LogLevel = LogLevel.INFO

export function setLogLevel(level: string | undefined): void {
  if (!level) return
  const normalized = level.toLowerCase()
  const resolved = LEVEL_NAMES[normalized]
  if (resolved !== undefined) {
    currentLevel = resolved
  }
}

function timestamp(): string {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function shouldLog(level: LogLevel): boolean {
  return level >= currentLevel
}

export const log = {
  debug(...args: unknown[]): void {
    if (shouldLog(LogLevel.DEBUG)) {
      console.log(`[${timestamp()}] [DEBUG]`, ...args)
    }
  },

  info(...args: unknown[]): void {
    if (shouldLog(LogLevel.INFO)) {
      console.info(`[${timestamp()}] [INFO]`, ...args)
    }
  },

  warn(...args: unknown[]): void {
    if (shouldLog(LogLevel.WARN)) {
      console.warn(`[${timestamp()}] [WARN]`, ...args)
    }
  },

  error(...args: unknown[]): void {
    if (shouldLog(LogLevel.ERROR)) {
      console.error(`[${timestamp()}] [ERROR]`, ...args)
    }
  },
}

/**
 * Create a filtered logger for SDK (e.g. @wecom/aibot-node-sdk).
 * Respects the current log level — SDK debug logs are suppressed when level >= INFO.
 */
export function createFilteredLogger(): {
  debug: (message: string, ...args: unknown[]) => void
  info: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
} {
  return {
    debug: (...args) => log.debug(...args),
    info: (...args) => log.info(...args),
    warn: (...args) => log.warn(...args),
    error: (...args) => log.error(...args),
  }
}
