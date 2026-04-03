import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Bridge } from './bridge.js'
import { acquireLock, releaseLock } from './lock.js'
import type { BridgeConfig } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main(): Promise<void> {
  const configPath = resolve(__dirname, '..', 'config.json')
  const configRaw = await readFile(configPath, 'utf-8')
  const config: BridgeConfig = JSON.parse(configRaw)

  if (!config.wecom.botId || !config.wecom.secret) {
    console.error('[Bridge] Error: wecom.botId and wecom.secret must be set in config.json')
    console.error('[Bridge] Get them from: 企业微信管理后台 → 工作台 → 智能机器人 → API模式 → 长连接')
    process.exit(1)
  }

  if (!config.project.cwd) {
    console.error('[Bridge] Error: project.cwd is not set in config.json')
    process.exit(1)
  }

  // Prevent multiple instances
  await acquireLock()

  console.log('[Bridge] Starting WeCom-Claude Bridge...')
  console.log(`[Bridge] Config: ${configPath}`)

  const bridge = new Bridge(config)

  const shutdown = async (signal: string) => {
    console.log(`\n[Bridge] Received ${signal}, shutting down...`)
    await bridge.stop()
    await releaseLock()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  await bridge.start()
}

main().catch(async (error) => {
  console.error('[Bridge] Fatal:', error)
  await releaseLock()
  process.exit(1)
})
