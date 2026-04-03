import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Bridge } from './bridge.js'
import { acquireLock, releaseLock } from './lock.js'
import { setLogLevel, log } from './logger.js'
import type { BridgeConfig } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main(): Promise<void> {
  const configPath = resolve(__dirname, '..', 'config.json')
  const configRaw = await readFile(configPath, 'utf-8')
  const config: BridgeConfig = JSON.parse(configRaw)

  // Initialize log level from config
  setLogLevel(config.bridge?.logLevel)

  if (!config.wecom.botId || !config.wecom.secret) {
    log.error('[Bridge] Error: wecom.botId and wecom.secret must be set in config.json')
    log.error('[Bridge] Get them from: 企业微信管理后台 → 工作台 → 智能机器人 → API模式 → 长连接')
    process.exit(1)
  }

  if (!config.project.cwd) {
    log.error('[Bridge] Error: project.cwd is not set in config.json')
    process.exit(1)
  }

  // Prevent multiple instances
  await acquireLock()

  log.info('[Bridge] Starting WeCom-Claude Bridge...')
  log.info(`[Bridge] Config: ${configPath}`)

  const bridge = new Bridge(config)

  const shutdown = async (signal: string) => {
    log.info(`\n[Bridge] Received ${signal}, shutting down...`)
    await bridge.stop()
    await releaseLock()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  await bridge.start()
}

main().catch(async (error) => {
  log.error('[Bridge] Fatal:', error)
  await releaseLock()
  process.exit(1)
})
