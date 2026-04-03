import { readFile, writeFile, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { log } from './logger.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const LOCK_FILE = join(__dirname, '..', 'data', 'bridge.lock')

function isProcessRunning(pid: number): boolean {
  try {
    // Windows: tasklist returns 0 if process exists
    // Unix: kill -0 checks existence
    if (process.platform === 'win32') {
      const result = execSync(`tasklist /FI "PID eq ${pid}" /NH`, {
        encoding: 'utf-8',
        windowsHide: true,
        timeout: 3000,
      })
      return result.includes(String(pid))
    }
      process.kill(pid, 0)
      return true
  } catch {
    return false
  }
}

export async function acquireLock(): Promise<void> {
  if (existsSync(LOCK_FILE)) {
    const content = await readFile(LOCK_FILE, 'utf-8').catch(() => '')
    const pid = parseInt(content.trim(), 10)

    if (!isNaN(pid) && isProcessRunning(pid)) {
      log.error(`[Bridge] Already running (PID ${pid}). Stop it first or delete ${LOCK_FILE}`)
      process.exit(1)
    }

    // Stale lock file — remove it
    await unlink(LOCK_FILE).catch(() => {})
  }

  await writeFile(LOCK_FILE, String(process.pid), 'utf-8')
}

export async function releaseLock(): Promise<void> {
  await unlink(LOCK_FILE).catch(() => {})
}
